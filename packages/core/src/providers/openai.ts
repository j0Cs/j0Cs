import OpenAI from "openai";
import type { ProviderId } from "../types";
import type { AgentMessage, ProviderAdapter, ProviderToolRequest, ProviderToolResponse } from "./types";

/** Histórico neutro → mensagens do Chat Completions (tool_calls / role "tool"). */
function paraChatCompletions(system: string, messages: AgentMessage[]) {
  const saida: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") saida.push({ role: "user", content: m.text });
    else if (m.role === "assistant") {
      saida.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
    } else {
      for (const r of m.results) saida.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERRO: ${r.output}` : r.output });
    }
  }
  return saida;
}

function usoDoChatCompletions(usage: OpenAI.CompletionUsage | undefined) {
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  // OpenAI inclui raciocínio em completion_tokens; a xAI soma à parte no total
  const output = Math.max(usage?.completion_tokens ?? 0, (usage?.total_tokens ?? 0) - prompt);
  return { inputTokens: Math.max(prompt - cached, 0), cacheReadTokens: cached, cacheWriteTokens: 0, outputTokens: output };
}

function argumentos(texto: string | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(texto || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return { _argumentos_invalidos: texto ?? "" };
  }
}

/**
 * Adapter para APIs no formato Chat Completions: OpenAI e xAI (Grok), que
 * documenta oficialmente o uso do SDK da OpenAI com `baseURL` próprio.
 */
function chatCompletionsAdapter(id: ProviderId, baseURL?: string): ProviderAdapter {
  return {
    id,
    async complete(req: ProviderToolRequest): Promise<ProviderToolResponse> {
      const client = new OpenAI({ apiKey: req.apiKey, ...(baseURL ? { baseURL } : {}) });
      const r = await client.chat.completions.create(
        {
          model: req.model,
          messages: paraChatCompletions(req.system, req.messages) as never,
          tools: req.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          tool_choice: "auto",
          max_completion_tokens: req.maxTokens ?? 16_000,
        },
        { signal: req.signal },
      );
      const escolha = r.choices[0];
      const msg = escolha?.message;
      const toolCalls = (msg?.tool_calls ?? [])
        .filter((c) => c.type === "function")
        .map((c) => {
          const f = (c as { function: { name: string; arguments: string } }).function;
          return { id: c.id, name: f.name, input: argumentos(f.arguments) };
        });
      const stopReason = escolha?.finish_reason ?? null;
      return {
        message: { role: "assistant", text: (msg?.content ?? "").trim(), toolCalls },
        servedModel: r.model ?? req.model,
        stopReason,
        refused: stopReason === "content_filter" || Boolean((msg as { refusal?: string | null } | undefined)?.refusal),
        usageByModel: [{ model: req.model, usage: usoDoChatCompletions(r.usage) }],
      };
    },
    async *stream(req) {
      const client = new OpenAI({ apiKey: req.apiKey, ...(baseURL ? { baseURL } : {}) });
      const stream = await client.chat.completions.create(
        {
          model: req.model,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            ...req.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        { signal: req.signal },
      );

      let servedModel = req.model;
      let stopReason: string | null = null;
      let usage: OpenAI.CompletionUsage | undefined;

      for await (const chunk of stream) {
        if (chunk.model) servedModel = chunk.model;
        const choice = chunk.choices[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        if (choice?.finish_reason) stopReason = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
      }

      const prompt = usage?.prompt_tokens ?? 0;
      const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
      // OpenAI inclui raciocínio em completion_tokens; a xAI soma à parte no total.
      // max(...) cobre os dois formatos sem subcontar.
      const output = Math.max(usage?.completion_tokens ?? 0, (usage?.total_tokens ?? 0) - prompt);

      yield {
        type: "finish",
        servedModel,
        stopReason,
        refused: stopReason === "content_filter",
        usageByModel: [
          {
            model: req.model,
            usage: {
              inputTokens: Math.max(prompt - cached, 0),
              cacheReadTokens: cached,
              cacheWriteTokens: 0,
              outputTokens: output,
            },
          },
        ],
      };
    },
  };
}

export const openaiAdapter = chatCompletionsAdapter("openai");
export const xaiAdapter = chatCompletionsAdapter("xai", "https://api.x.ai/v1");
