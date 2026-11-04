import { computeChargeBrlMicros, VOICE_PRODUCTS, voiceCostUsdMicros, type VoiceProduct } from "@forja/core";
import { decryptSecret, endLiveSession } from "@forja/core/server";
import { and, createGatewayStore, eq, getPricingSettings, inArray, schema, sql, type Db } from "@forja/db";
import { ASSISTANT_NAME } from "./persona";

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
Comece cumprimentando ${nome} pelo nome e perguntando o que a pessoa quer construir.
Fale de forma natural e calorosa, em frases curtas. Para qualquer pergunta técnica, decisão de produto,
estimativa ou proposta, delegue ao backend e fale a resposta que ele devolver, com suas palavras e sem ler listas.
Enquanto o backend pensa, mantenha a conversa viva com uma frase curta ("deixa eu pensar nisso um segundo").
Nunca invente preços, prazos ou recursos da plataforma.`;
}

/** Preço de tabela por minuto em micro-reais (para mostrar antes de entrar). */
export async function precoMinutoBrlMicros(db: Db) {
  const settings = await getPricingSettings(db);
  return computeChargeBrlMicros(VOZ_PRODUTO.usdMicrosPerMinute, settings, VOZ_PRODUTO.markupPercent);
}

/** Há chave da OpenAI ativa para a voz em nuvem? */
export async function vozNuvemDisponivel(db: Db, orgId: string) {
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
 * (fim da cobrança). Se o desligamento falhar, a varredura tenta de novo a cada minuto; sem
 * chave para desligar (apagada) ou falhando há DESISTIR_DESLIGAMENTO_MINUTOS, fecha mesmo
 * assim, com alerta no log, para não prender o usuário (índice de uma call por usuário).
 */
export async function encerrarSessao(db: Db, sessao: Sessao, motivo: string): Promise<boolean> {
  if (sessao.status === "closed") return true;
  await db
    .update(schema.voiceSessions)
    .set({ status: "closing", endReason: motivo, endedAt: new Date() })
    .where(and(eq(schema.voiceSessions.id, sessao.id), inArray(schema.voiceSessions.status, ["connecting", "active"])));

  let desligou = sessao.providerSessionId === "pendente"; // nunca chegou a existir no provedor
  let semVolta: string | null = null;
  if (!desligou) {
    // usa a MESMA chave que abriu a sessão (nada de cair numa chave de outro projeto)
    const chave = sessao.providerKeyId
      ? await db.query.providerKeys.findFirst({ where: eq(schema.providerKeys.id, sessao.providerKeyId) })
      : null;
    const apiKey = chave ? decryptSecret(chave.encryptedKey) : sessao.providerKeyId ? null : process.env.OPENAI_API_KEY;
    if (apiKey) {
      const r = await endLiveSession({ apiKey, sessionId: sessao.providerSessionId }).catch(() => ({ ok: false as const }));
      desligou = r.ok;
      if (r.ok && "usageSeconds" in r && r.usageSeconds !== undefined) {
        // conciliação: segundos que o provedor cobrou x segundos que cobramos do cliente
        console.log(JSON.stringify({ level: "info", msg: "call desligada", sessao: sessao.id, via: r.via, motivo: r.reason, segundosProvedor: r.usageSeconds, segundosCobrados: sessao.billedSeconds }));
      }
    } else semVolta = "sem-chave-para-desligar";
  }
  if (!desligou && !semVolta) {
    const desde = (sessao.status === "closing" ? sessao.endedAt : null) ?? new Date();
    if (Date.now() - desde.getTime() >= DESISTIR_DESLIGAMENTO_MINUTOS * 60_000) semVolta = "desligamento-abandonado";
  }
  if (!desligou && !semVolta) {
    console.error(JSON.stringify({ level: "error", msg: "hangup falhou; nova tentativa na varredura", sessao: sessao.id }));
    return false;
  }
  if (semVolta) {
    // A sessão pode seguir aberta no provedor até o limite dele: custo da plataforma. Investigar a chave.
    console.error(JSON.stringify({ level: "critical", msg: "call fechada sem confirmar desligamento no provedor", motivo: semVolta, sessao: sessao.id, chave: sessao.providerKeyId }));
  }
  await db
    .update(schema.voiceSessions)
    .set({
      status: "closed",
      endedAt: sql`coalesce(${schema.voiceSessions.endedAt}, now())`,
      ...(semVolta ? { endReason: sql`coalesce(${schema.voiceSessions.endReason}, '') || ${"+" + semVolta}` } : {}),
    })
    .where(eq(schema.voiceSessions.id, sessao.id));
  return true;
}
