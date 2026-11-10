import Anthropic from "@anthropic-ai/sdk";
import type { NormalizedUsage } from "../types";
import type { AgentMessage, AgentToolCall, ModelUsage, ProviderAdapter, ProviderToolRequest } from "./types";

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

type Bloco = { type: string; [k: string]: unknown };

/** Histórico neutro → mensagens da API da Anthropic (blocos tool_use / tool_result). */
function paraAnthropic(messages: AgentMessage[]) {
  const saida: { role: "user" | "assistant"; content: string | Bloco[] }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      saida.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      // o mesmo provedor recebe o conteúdo original (inclui raciocínio, que precisa voltar intacto)
      if (m.raw?.provider === "anthropic" && Array.isArray(m.raw.content)) {
        saida.push({ role: "assistant", content: m.raw.content as Bloco[] });
        continue;
      }
      const blocos: Bloco[] = [];
      if (m.text) blocos.push({ type: "text", text: m.text });
      for (const c of m.toolCalls) blocos.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      saida.push({ role: "assistant", content: blocos.length ? blocos : [{ type: "text", text: "…" }] });
    } else {
      saida.push({
        role: "user",
        content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.output, ...(r.isError ? { is_error: true } : {}) })),
      });
    }
  }
  return saida;
}

async function completarAnthropic(req: ProviderToolRequest) {
  const client = new Anthropic({ apiKey: req.apiKey });
  const withFallback = SERVER_FALLBACK_MODELS.has(req.model);
  const params = {
    model: req.model,
    max_tokens: req.maxTokens ?? 16_000,
    system: req.system,
    messages: paraAnthropic(req.messages),
    tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
    // cache automático do prefixo: cada passo do agente relê o histórico, ~10x mais barato
    cache_control: { type: "ephemeral" },
    output_config: { effort: req.effort ?? "medium" },
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
  const message = (await client.beta.messages.create(params as never, { signal: req.signal })) as unknown as {
    model: string;
    stop_reason: string | null;
    content: Bloco[];
    usage: RawUsage;
  };
  const texto = message.content
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("\n")
    .trim();
  const toolCalls: AgentToolCall[] = message.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: String(b.id), name: String(b.name), input: (b.input ?? {}) as Record<string, unknown> }));
  return {
    message: { role: "assistant" as const, text: texto, toolCalls, raw: { provider: "anthropic" as const, content: message.content } },
    servedModel: message.model,
    stopReason: message.stop_reason,
    refused: message.stop_reason === "refusal",
    usageByModel: usageByModel(req.model, message.model, message.usage),
  };
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  complete: completarAnthropic,
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
