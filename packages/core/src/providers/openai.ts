import OpenAI from "openai";
import type { ProviderId } from "../types";
import type { ProviderAdapter } from "./types";

/**
 * Adapter para APIs no formato Chat Completions: OpenAI e xAI (Grok), que
 * documenta oficialmente o uso do SDK da OpenAI com `baseURL` próprio.
 */
function chatCompletionsAdapter(id: ProviderId, baseURL?: string): ProviderAdapter {
  return {
    id,
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
