import { computeChargeBrlMicros, VOICE_PRODUCTS, voiceCostUsdMicros, type VoiceProduct } from "@forja/core";
import { decryptSecret, endLiveSession, type FimDaSessao } from "@forja/core/server";
import { and, chaveDoCofrePorId, consumeRateLimit, createGatewayStore, eq, getPricingSettings, inArray, lt, or, schema, sql, type Db } from "@forja/db";
import { ASSISTANT_NAME, PERSONA_HEFESTO } from "./persona";

export const VOZ_PRODUTO: VoiceProduct = VOICE_PRODUCTS["gpt-live-1"]!;
/** O navegador manda um pulso a cada 15 s; sem pulso por 60 s a chamada é encerrada pela varredura. */
export const PULSO_SEGUNDOS = 15;
/** Sem pulso por este tempo (2 pulsos perdidos), a varredura cobra até agora e desliga. */
export const SEM_PULSO_SEGUNDOS = 30;
/** Desligamento falhando há este tempo (chave revogada, provedor fora): desiste e libera o usuário. */
export const DESISTIR_DESLIGAMENTO_MINUTOS = 10;

type Sessao = typeof schema.voiceSessions.$inferSelect;

/** Instruções da voz (GPT-Live). O raciocínio de verdade é delegado ao nosso gateway. */
export function instrucoesDaVoz(nome: string) {
  return `Você é ${ASSISTANT_NAME}, engenheiro-chefe da plataforma Forja, numa chamada de voz em português do Brasil com ${nome}.

${PERSONA_HEFESTO}

Voz e ritmo: fale devagar e com calma, num tom grave, firme e acolhedor, como um homem maduro e experiente conversando
de igual para igual. Faça pausas naturais entre as ideias. Nada de animação de locutor ou de atendente de telemarketing:
é uma conversa entre duas pessoas.

Comece cumprimentando ${nome} pelo nome, com calma, e perguntando o que vocês vão construir.
Para qualquer pergunta técnica, decisão de produto, estimativa ou proposta, delegue ao backend e fale a resposta que ele
devolver com as suas palavras, sem ler listas. Enquanto o backend pensa, mantenha a conversa viva com uma frase curta
("deixa eu pensar nisso um instante"). Nunca invente preços, prazos ou recursos da plataforma.`;
}

/** Preço de tabela por minuto em micro-reais (para mostrar antes de entrar). */
export async function precoMinutoBrlMicros(db: Db) {
  const settings = await getPricingSettings(db);
  return computeChargeBrlMicros(VOZ_PRODUTO.usdMicrosPerMinute, settings, VOZ_PRODUTO.markupPercent);
}

/** Há chave da OpenAI ativa para a voz em nuvem? */
/**
 * A voz em nuvem só liga com VOZ_NUVEM_HABILITADA=1 (e uma chave da OpenAI no painel ou no Vault).
 * No Hobby o cron roda 1 vez por dia; a varredura também roda a cada pulso e a cada abertura de
 * call (varrerSeForAVez). No Pro, volte o cron de apps/web/vercel.json para "* * * * *".
 */
export const vozNuvemHabilitada = () => process.env.VOZ_NUVEM_HABILITADA === "1";

export async function vozNuvemDisponivel(db: Db, orgId: string) {
  if (!vozNuvemHabilitada()) return false;
  const keys = await createGatewayStore(db).listProviderKeys("openai", orgId);
  return keys.length > 0;
}

/**
 * Cobra os segundos ainda não cobrados até `ate`. O "claim" condicional em billed_seconds
 * evita cobrança dupla quando o pulso e a varredura rodam ao mesmo tempo.
 * Sessão em "closing" só é cobrada até o momento em que pedimos o fim (ended_at): se o
 * desligamento no provedor falhar, o tempo extra é custo da plataforma, não do cliente.
 */
export async function cobrarAte(db: Db, sessao: Sessao, ate: Date) {
  if (sessao.status !== "active" && sessao.status !== "closing") return { cobrado: 0, saldo: null as number | null };
  // conexão que não fechou: a plataforma decidiu absorver, nem a retentativa da varredura cobra
  if (sessao.status === "closing" && sessao.endReason?.startsWith("falha-conexao")) return { cobrado: 0, saldo: null as number | null };
  const limite = sessao.status === "closing" ? Math.min(ate.getTime(), (sessao.endedAt ?? sessao.lastPulseAt).getTime()) : ate.getTime();
  const total = Math.max(PULSO_SEGUNDOS, Math.floor((limite - sessao.startedAt.getTime()) / 1000));
  const novos = total - sessao.billedSeconds;
  if (novos <= 0) return { cobrado: 0, saldo: null as number | null };

  const [claim] = await db
    .update(schema.voiceSessions)
    .set({ billedSeconds: total, lastPulseAt: new Date() })
    .where(and(eq(schema.voiceSessions.id, sessao.id), eq(schema.voiceSessions.billedSeconds, sessao.billedSeconds)))
    .returning({ id: schema.voiceSessions.id });
  if (!claim) return { cobrado: 0, saldo: null };

  const settings = await getPricingSettings(db);
  const custo = voiceCostUsdMicros(novos, VOZ_PRODUTO);
  const cobranca = computeChargeBrlMicros(custo, settings, VOZ_PRODUTO.markupPercent);
  const { balanceBrlMicros } = await createGatewayStore(db).recordUsage({
    orgId: sessao.orgId,
    userId: sessao.userId,
    projectId: sessao.projectId,
    conversationId: sessao.conversationId,
    modelId: VOZ_PRODUTO.id,
    servedModelId: sessao.model,
    providerId: VOZ_PRODUTO.providerId,
    providerKeyId: sessao.providerKeyId,
    usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
    costUsdMicros: custo,
    chargeBrlMicros: cobranca,
    pricingSnapshot: {
      fxUsdBrl: settings.fxUsdBrl,
      costOverheadPercent: settings.costOverheadPercent,
      markupPercent: VOZ_PRODUTO.markupPercent,
      byok: false,
      voiceSeconds: novos,
    },
    latencyMs: 0,
    status: "ok",
  });
  return { cobrado: cobranca, saldo: balanceBrlMicros };
}

/**
 * Desliga no provedor e só então marca como fechada. Ao entrar em "closing" grava ended_at
 * (fim da cobrança: `fimCobranca`, ou agora). Se o desligamento não for confirmado, a varredura
 * tenta de novo a cada minuto. Fecha mesmo assim, com alerta `critical` no log, para não
 * prender o usuário (índice de uma call por pessoa), quando: não há chave para desligar, a
 * OpenAI recusou a chave, ou o prazo de DESISTIR_DESLIGAMENTO_MINUTOS passou (conferido ANTES
 * de chamar o provedor, para um provedor lento não segurar a desistência).
 */
export async function encerrarSessao(db: Db, sessao: Sessao, motivo: string, fimCobranca?: Date): Promise<boolean> {
  if (sessao.status === "closed") return true;
  // estado atual da linha: a cópia de quem chamou pode estar velha (ex.: /fim lido durante a
  // reserva, antes de /sessao gravar o id da sessão no provedor)
  const [transicao] = await db
    .update(schema.voiceSessions)
    .set({ status: "closing", endReason: motivo, endedAt: fimCobranca ?? new Date() })
    .where(and(eq(schema.voiceSessions.id, sessao.id), inArray(schema.voiceSessions.status, ["connecting", "active"])))
    .returning();
  const atual = transicao ?? (await db.query.voiceSessions.findFirst({ where: eq(schema.voiceSessions.id, sessao.id) }));
  if (!atual || atual.status === "closed") return true;

  let desligou = atual.providerSessionId === "pendente"; // nunca chegou a existir no provedor
  let semVolta: string | null = null;
  const vencido = !transicao && atual.endedAt && Date.now() - atual.endedAt.getTime() >= DESISTIR_DESLIGAMENTO_MINUTOS * 60_000;
  if (!desligou && vencido) semVolta = "desligamento-abandonado";
  if (!desligou && !semVolta) {
    // usa a MESMA chave que abriu a sessão (nada de cair numa chave de outro projeto)
    const chave = atual.providerKeyId
      ? await db.query.providerKeys.findFirst({ where: eq(schema.providerKeys.id, atual.providerKeyId) })
      : null;
    // sem linha no painel: a call pode ter sido aberta com uma chave do Vault da Supabase
    const doCofre = !chave && atual.providerKeyId ? await chaveDoCofrePorId(db, atual.providerKeyId) : null;
    const apiKey = chave
      ? decryptSecret(chave.encryptedKey)
      : doCofre
        ? doCofre.secret
        : atual.providerKeyId
          ? null
          : process.env.OPENAI_API_KEY;
    if (apiKey) {
      const r: FimDaSessao = await endLiveSession({ apiKey, sessionId: atual.providerSessionId }).catch(() => ({ ok: false as const }));
      desligou = r.ok;
      if (!r.ok && r.chaveRecusada) semVolta = "chave-recusada";
      // todo resultado vai para o log: conciliação (segundos do provedor x cobrados) e diagnóstico
      const registro = {
        msg: r.ok ? (r.confirmado ? "call desligada" : "call dada como desligada sem confirmação") : "desligamento não confirmado",
        sessao: atual.id,
        motivo,
        segundosCobrados: atual.billedSeconds,
        ...(r.ok && r.via === "sideband" ? { via: r.via, motivoProvedor: r.reason, segundosProvedor: r.usageSeconds } : {}),
        ...(r.ok && r.via === "hangup" ? { via: r.via, status: r.status } : {}),
        ...(!r.ok ? { status: r.status } : {}),
      };
      const nivel = r.ok && r.confirmado ? "info" : r.ok ? "warn" : "error";
      console[nivel === "info" ? "log" : nivel === "warn" ? "warn" : "error"](JSON.stringify({ level: nivel, ...registro }));
    } else semVolta = "sem-chave-para-desligar";
  }
  if (!desligou && !semVolta) return false; // nova tentativa na próxima varredura
  if (semVolta) {
    // A sessão pode seguir aberta no provedor até o limite dele: custo da plataforma. Investigar a chave.
    console.error(JSON.stringify({ level: "critical", msg: "call fechada sem confirmar desligamento no provedor", motivo: semVolta, sessao: atual.id, chave: atual.providerKeyId }));
  }
  await db
    .update(schema.voiceSessions)
    .set({
      status: "closed",
      endedAt: sql`coalesce(${schema.voiceSessions.endedAt}, now())`,
      ...(semVolta ? { endReason: sql`coalesce(${schema.voiceSessions.endReason}, '') || ${"+" + semVolta}` } : {}),
    })
    .where(eq(schema.voiceSessions.id, atual.id));
  return true;
}

/** Sem pulso: cobra no máximo até o último pulso + este tempo (30 s sem pulso + 1 min de folga). */
const TETO_SEM_PULSO_SEGUNDOS = SEM_PULSO_SEGUNDOS + 60;
/** Duração máxima de uma call (o pulso encerra ao passar daqui). */
export const VOZ_MAX_MINUTOS = 60;

/**
 * Varredura das sessões de voz:
 * - "active" sem pulso há 30 s: cobra até o último pulso + 90 s, no máximo, e desliga;
 * - "connecting" parada há mais de 2 min: reserva órfã, libera;
 * - "closing" (desligamento não confirmado): tenta de novo, sem cobrar nada além do ended_at.
 * Abandonadas primeiro, retentativas depois; cada sessão isolada (uma falha não trava as outras).
 */
export async function varrerSessoes(db: Db, opcoes: { limite: number; orcamentoMs: number }) {
  const agora = Date.now();
  const pendentes = await db
    .select()
    .from(schema.voiceSessions)
    .where(
      or(
        and(eq(schema.voiceSessions.status, "active"), lt(schema.voiceSessions.lastPulseAt, new Date(agora - SEM_PULSO_SEGUNDOS * 1000))),
        eq(schema.voiceSessions.status, "closing"),
        and(eq(schema.voiceSessions.status, "connecting"), lt(schema.voiceSessions.startedAt, new Date(agora - 120_000))),
      ),
    )
    // abandonadas antes das retentativas: retentativas antigas não podem ocupar o lote inteiro
    .orderBy(sql`case ${schema.voiceSessions.status} when 'active' then 0 when 'connecting' then 1 else 2 end`, schema.voiceSessions.lastPulseAt)
    .limit(opcoes.limite);

  let encerradas = 0;
  let falhas = 0;
  let adiadas = 0;
  for (const s of pendentes) {
    if (Date.now() - agora > opcoes.orcamentoMs) {
      adiadas++;
      continue;
    }
    try {
      if (s.status === "connecting") {
        await db.update(schema.voiceSessions).set({ status: "closed", endedAt: new Date(), endReason: "reserva-orfa" }).where(and(eq(schema.voiceSessions.id, s.id), inArray(schema.voiceSessions.status, ["connecting"])));
        continue;
      }
      let ok: boolean;
      if (s.status === "active") {
        const ate = new Date(Math.min(Date.now(), s.lastPulseAt.getTime() + TETO_SEM_PULSO_SEGUNDOS * 1000));
        await cobrarAte(db, s, ate);
        ok = await encerrarSessao(db, s, "sem-pulso", ate);
      } else {
        await cobrarAte(db, s, new Date()); // limitado ao ended_at gravado quando o fim foi pedido
        ok = await encerrarSessao(db, s, s.endReason ?? "retentativa");
      }
      if (ok) encerradas++;
      else falhas++;
    } catch (err) {
      falhas++;
      console.error(JSON.stringify({ level: "error", msg: "varredura de voz falhou", sessao: s.id, err: String(err) }));
    }
  }
  return { verificadas: pendentes.length, encerradas, falhas, adiadas };
}

/**
 * No Hobby da Vercel o cron roda 1 vez por dia, então cada pulso e cada abertura de call também
 * disparam uma varredura curta, no máximo uma a cada 20 s no sistema todo. Com qualquer call
 * ativa, uma call abandonada é encerrada em menos de um minuto.
 */
export async function varrerSeForAVez(db: Db) {
  if (!(await consumeRateLimit(db, "voz-varredura", 1, 20))) return;
  await varrerSessoes(db, { limite: 5, orcamentoMs: 10_000 });
}

