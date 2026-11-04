import { computeChargeBrlMicros, VOICE_PRODUCTS, voiceCostUsdMicros, type VoiceProduct } from "@forja/core";
import { decryptSecret, hangupLiveSession } from "@forja/core/server";
import { and, createGatewayStore, eq, getPricingSettings, schema, type Db } from "@forja/db";
import { ASSISTANT_NAME } from "./persona";

export const VOZ_PRODUTO: VoiceProduct = VOICE_PRODUCTS["gpt-live-1"]!;
/** O navegador manda um pulso a cada 15 s; sem pulso por 60 s a chamada é encerrada pela varredura. */
export const PULSO_SEGUNDOS = 15;

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
 */
export async function cobrarAte(db: Db, sessao: Sessao, ate: Date) {
  const total = Math.max(PULSO_SEGUNDOS, Math.floor((ate.getTime() - sessao.startedAt.getTime()) / 1000));
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

/** Encerra no provedor e marca como fechada (idempotente). */
export async function encerrarSessao(db: Db, sessao: Sessao, motivo: string) {
  if (sessao.status === "closed") return;
  const [fechada] = await db
    .update(schema.voiceSessions)
    .set({ status: "closed", endedAt: new Date(), endReason: motivo })
    .where(and(eq(schema.voiceSessions.id, sessao.id), eq(schema.voiceSessions.status, "active")))
    .returning({ id: schema.voiceSessions.id });
  if (!fechada) return;
  const chave = sessao.providerKeyId
    ? await db.query.providerKeys.findFirst({ where: eq(schema.providerKeys.id, sessao.providerKeyId) })
    : null;
  const apiKey = chave ? decryptSecret(chave.encryptedKey) : process.env.OPENAI_API_KEY;
  if (apiKey) {
    await hangupLiveSession({ apiKey, sessionId: sessao.providerSessionId }).catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "hangup falhou", sessao: sessao.id, err: String(err) })),
    );
  }
}
