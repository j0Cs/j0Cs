import { MENSAGENS_DE_BLOQUEIO, type BloqueioCode } from "./acesso";
import { computeChargeBrlMicros, computeCostUsdMicros } from "./pricing";
import { DEFAULT_ADAPTERS } from "./providers";
import type { Effort, ProviderAdapter } from "./providers/types";
import type {
  CatalogModel,
  ChatMessage,
  ModelTier,
  NormalizedUsage,
  PricingSettings,
  ProviderId,
} from "./types";

/**
 * Gateway de IA: o único caminho entre a plataforma e os provedores.
 *
 *   cliente → [modelo habilitado? plano permite? tem saldo?] → chave do pool
 *           → provedor (streaming) → medição de tokens → custo US$ → cobrança R$
 *           → evento de uso + débito no extrato (mesma transação)
 *
 * O armazenamento é injetado (GatewayStore) para o núcleo ficar testável sem banco.
 */

export interface OrgAccess {
  status: "active" | "suspended";
  balanceBrlMicros: number;
  allowedTiers: ModelTier[];
  /** Teste acabou, sem plano, inadimplente ou suspensa (regra em acesso.ts). */
  bloqueio?: { code: BloqueioCode; message: string } | null;
}

export interface ProviderKeyCandidate {
  /** null = chave vinda de variável de ambiente (desenvolvimento). */
  id: string | null;
  apiKey: string;
  /** true = chave do próprio cliente (BYOK): não debita custo de API, só taxa de plataforma. */
  byok?: boolean;
}

export interface UsageRecord {
  orgId: string;
  userId: string | null;
  projectId: string | null;
  conversationId: string | null;
  modelId: string;
  servedModelId: string;
  providerId: ProviderId;
  providerKeyId: string | null;
  usage: NormalizedUsage;
  costUsdMicros: number;
  chargeBrlMicros: number;
  pricingSnapshot: {
    fxUsdBrl: number;
    costOverheadPercent: number;
    markupPercent: number;
    byok: boolean;
    /** Segundos de voz cobrados (chamadas em nuvem). */
    voiceSeconds?: number;
  };
  latencyMs: number;
  /** aborted = o cliente interrompeu (cobrado por estimativa); error = falha do provedor (não cobrado). */
  status: "ok" | "refused" | "error" | "aborted";
  errorMessage?: string;
}

export interface GatewayStore {
  /** Busca no catálogo, inclusive modelos desabilitados (para precificar fallbacks). */
  getModel(id: string): Promise<CatalogModel | null>;
  getSettings(): Promise<PricingSettings>;
  getOrgAccess(orgId: string): Promise<OrgAccess | null>;
  /** Chaves em ordem de prioridade; o gateway tenta a próxima se a anterior falhar antes de responder. */
  listProviderKeys(providerId: ProviderId, orgId: string): Promise<ProviderKeyCandidate[]>;
  /** Grava o evento e debita o saldo atomicamente. Retorna o saldo atualizado. */
  recordUsage(record: UsageRecord): Promise<{ balanceBrlMicros: number; usageEventId?: string }>;
}

export interface GatewayChatRequest {
  orgId: string;
  userId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  modelId: string;
  system?: string;
  messages: ChatMessage[];
  effort?: Effort;
  signal?: AbortSignal;
}

export type GatewayErrorCode =
  | "model_unavailable"
  | "org_inactive"
  | "payment_overdue"
  | "trial_ended"
  | "subscription_required"
  | "plan_upgrade_required"
  | "insufficient_credits"
  | "provider_unavailable"
  | "provider_error";

export type GatewayEvent =
  | { type: "text"; text: string }
  | {
      type: "done";
      servedModel: string;
      stopReason: string | null;
      refused: boolean;
      usage: NormalizedUsage;
      costUsdMicros: number;
      chargeBrlMicros: number;
      balanceBrlMicros: number;
      usageEventId?: string;
    }
  | { type: "error"; code: GatewayErrorCode; message: string };

export class GatewayError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface GatewayDeps {
  store: GatewayStore;
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  now?: () => number;
}

const ERROR_MESSAGES: Record<Exclude<GatewayErrorCode, "provider_error">, string> = {
  model_unavailable: "Este modelo não está disponível no momento.",
  org_inactive: MENSAGENS_DE_BLOQUEIO.org_inactive,
  payment_overdue: MENSAGENS_DE_BLOQUEIO.payment_overdue,
  trial_ended: MENSAGENS_DE_BLOQUEIO.trial_ended,
  subscription_required: MENSAGENS_DE_BLOQUEIO.subscription_required,
  plan_upgrade_required: "Seu plano não inclui este modelo. Faça upgrade para usá-lo.",
  insufficient_credits: "Saldo de créditos insuficiente. Faça uma recarga para continuar.",
  provider_unavailable: "Provedor sem chave ativa configurada.",
};

const fail = (code: Exclude<GatewayErrorCode, "provider_error">) => new GatewayError(code, ERROR_MESSAGES[code]);

/** Valida acesso antes de qualquer chamada paga. */
export async function authorize(store: GatewayStore, req: GatewayChatRequest) {
  const model = await store.getModel(req.modelId);
  if (!model || !model.enabled) throw fail("model_unavailable");

  const access = await store.getOrgAccess(req.orgId);
  if (!access) throw fail("org_inactive");
  if (access.bloqueio) throw fail(access.bloqueio.code);
  if (access.status !== "active") throw fail("org_inactive");
  if (!access.allowedTiers.includes(model.tier)) throw fail("plan_upgrade_required");

  const settings = await store.getSettings();
  const keys = await store.listProviderKeys(model.providerId, req.orgId);
  if (keys.length === 0) throw fail("provider_unavailable");

  const allByok = keys.every((k) => k.byok);
  if (!allByok && access.balanceBrlMicros < settings.minBalanceBrlMicros) throw fail("insufficient_credits");

  return { model, settings, keys };
}

/**
 * Estimativa de uso de uma resposta interrompida. A entrada é contada pelo tamanho do prompt
 * (≈4 caracteres por token) e tratada como 70% lida do cache (prefixo estável), 30% nova.
 */
export function estimateAbortedUsage(req: Pick<GatewayChatRequest, "system" | "messages">, outputChars: number): NormalizedUsage {
  const chars = (req.system?.length ?? 0) + req.messages.reduce((n, m) => n + m.content.length, 0);
  const entrada = Math.ceil(chars / 4);
  const cache = Math.floor(entrada * 0.7);
  return { inputTokens: entrada - cache, cacheReadTokens: cache, cacheWriteTokens: 0, outputTokens: Math.ceil(outputChars / 4) };
}

export async function* runChat(deps: GatewayDeps, req: GatewayChatRequest): AsyncGenerator<GatewayEvent> {
  const now = deps.now ?? Date.now;
  const adapters = { ...DEFAULT_ADAPTERS, ...deps.adapters };

  let auth: Awaited<ReturnType<typeof authorize>>;
  try {
    auth = await authorize(deps.store, req);
  } catch (err) {
    if (err instanceof GatewayError) {
      yield { type: "error", code: err.code, message: err.message };
      return;
    }
    throw err;
  }
  const { model, settings, keys } = auth;
  const adapter = adapters[model.providerId];

  const base = {
    orgId: req.orgId,
    userId: req.userId ?? null,
    projectId: req.projectId ?? null,
    conversationId: req.conversationId ?? null,
    modelId: model.id,
    providerId: model.providerId,
  };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const startedAt = now();
    let emittedText = false;
    let emittedChars = 0;
    try {
      for await (const event of adapter.stream({
        model: model.id,
        system: req.system,
        messages: req.messages,
        apiKey: key.apiKey,
        effort: req.effort,
        signal: req.signal,
      })) {
        if (event.type === "text") {
          emittedText = true;
          emittedChars += event.text.length;
          yield event;
          continue;
        }

        // finish → precifica cada modelo que rodou (fallbacks usam a tabela do próprio modelo)
        let costUsdMicros = 0;
        const total: NormalizedUsage = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
        for (const part of event.usageByModel) {
          const pricedBy = part.model === model.id ? model : ((await deps.store.getModel(part.model)) ?? model);
          costUsdMicros += computeCostUsdMicros(part.usage, pricedBy.pricing);
          total.inputTokens += part.usage.inputTokens;
          total.cacheReadTokens += part.usage.cacheReadTokens;
          total.cacheWriteTokens += part.usage.cacheWriteTokens;
          total.outputTokens += part.usage.outputTokens;
        }
        const byok = key.byok === true;
        const chargeBrlMicros = byok ? 0 : computeChargeBrlMicros(costUsdMicros, settings, model.markupPercent);

        const { balanceBrlMicros, usageEventId } = await deps.store.recordUsage({
          ...base,
          servedModelId: event.servedModel,
          providerKeyId: key.id,
          usage: total,
          costUsdMicros: byok ? 0 : costUsdMicros,
          chargeBrlMicros,
          pricingSnapshot: {
            fxUsdBrl: settings.fxUsdBrl,
            costOverheadPercent: settings.costOverheadPercent,
            markupPercent: model.markupPercent,
            byok,
          },
          latencyMs: now() - startedAt,
          status: event.refused ? "refused" : "ok",
        });

        yield {
          type: "done",
          servedModel: event.servedModel,
          stopReason: event.stopReason,
          refused: event.refused,
          usage: total,
          costUsdMicros,
          chargeBrlMicros,
          balanceBrlMicros,
          usageEventId,
        };
      }
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastKey = i === keys.length - 1;

      // O cliente interrompeu (falou por cima do agente, fechou a aba): o provedor já cobrou a entrada
      // e o que foi gerado, então cobramos uma ESTIMATIVA (≈4 caracteres por token).
      if (req.signal?.aborted) {
        const usage = estimateAbortedUsage(req, emittedChars);
        const byok = key.byok === true;
        const costUsdMicros = byok ? 0 : computeCostUsdMicros(usage, model.pricing);
        await deps.store.recordUsage({
          ...base,
          servedModelId: model.id,
          providerKeyId: key.id,
          usage,
          costUsdMicros,
          chargeBrlMicros: byok ? 0 : computeChargeBrlMicros(costUsdMicros, settings, model.markupPercent),
          pricingSnapshot: {
            fxUsdBrl: settings.fxUsdBrl,
            costOverheadPercent: settings.costOverheadPercent,
            markupPercent: model.markupPercent,
            byok,
          },
          latencyMs: now() - startedAt,
          status: "aborted",
          errorMessage: "interrompida pelo cliente (uso estimado)",
        });
        return;
      }

      // Sem texto emitido ainda → dá para tentar a próxima chave do pool sem o cliente perceber.
      if (!emittedText && !isLastKey) continue;

      // Falha do provedor não é cobrada do cliente; registramos uma estimativa do
      // custo parcial (≈4 caracteres por token de saída) para a conciliação do dono.
      const partial: NormalizedUsage = {
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: Math.ceil(emittedChars / 4),
      };
      await deps.store.recordUsage({
        ...base,
        servedModelId: model.id,
        providerKeyId: key.id,
        usage: partial,
        costUsdMicros: key.byok ? 0 : computeCostUsdMicros(partial, model.pricing),
        chargeBrlMicros: 0,
        pricingSnapshot: {
          fxUsdBrl: settings.fxUsdBrl,
          costOverheadPercent: settings.costOverheadPercent,
          markupPercent: model.markupPercent,
          byok: key.byok === true,
        },
        latencyMs: now() - startedAt,
        status: "error",
        errorMessage: message.slice(0, 500),
      });
      yield { type: "error", code: "provider_error", message: "O provedor falhou ao responder. Tente novamente." };
      return;
    }
  }
}
