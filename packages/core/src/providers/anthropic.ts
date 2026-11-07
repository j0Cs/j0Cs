import Anthropic from "@anthropic-ai/sdk";
import type { NormalizedUsage } from "../types";
import type { ModelUsage, ProviderAdapter } from "./types";

/**
 * Modelos Claude que aceitam fallback no servidor: se o classificador de segurança
 * recusar, a própria API reexecuta num modelo alternativo recomendado.
 * (Haiku 5.5 não tem fallback no servidor.)
 */
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5"]);

interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function normalize(u: RawUsage): NormalizedUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
  };
}

/**
 * Com fallback, `usage.iterations` traz o uso de cada tentativa (fonte da verdade
 * para cobrança). Entradas `fallback_message` foram servidas pelo modelo final
 * (`message.model`); as demais pelo modelo pedido.
 */
function usageByModel(requested: string, served: string, usage: RawUsage): ModelUsage[] {
  const iterations = (usage as { iterations?: unknown }).iterations;
  if (Array.isArray(iterations) && iterations.length > 0) {
    return iterations.map((entry) => {
      const e = entry as RawUsage & { type?: string; model?: unknown };
      const model = typeof e.model === "string" ? e.model : e.type === "fallback_message" ? served : requested;
      return { model, usage: normalize(e) };
    });
  }
  return [{ model: served, usage: normalize(usage) }];
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  async *stream(req) {
    const client = new Anthropic({ apiKey: req.apiKey });
    const withFallback = SERVER_FALLBACK_MODELS.has(req.model);

    const stream = client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: 64_000,
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        // Cache automático do prefixo: conversas longas e agentes ficam ~10x mais baratos.
        cache_control: { type: "ephemeral" },
        output_config: { effort: req.effort ?? "high" },
        ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: req.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    yield {
      type: "finish",
      servedModel: message.model,
      stopReason: message.stop_reason,
      refused: message.stop_reason === "refusal",
      usageByModel: usageByModel(req.model, message.model, message.usage as RawUsage),
    };
  },
};
