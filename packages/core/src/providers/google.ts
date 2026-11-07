import { GoogleGenAI } from "@google/genai";
import type { ProviderAdapter } from "./types";

export const googleAdapter: ProviderAdapter = {
  id: "google",
  async *stream(req) {
    const ai = new GoogleGenAI({ apiKey: req.apiKey });
    const stream = await ai.models.generateContentStream({
      model: req.model,
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        ...(req.system ? { systemInstruction: req.system } : {}),
        ...(req.signal ? { abortSignal: req.signal } : {}),
      },
    });

    let stopReason: string | null = null;
    let servedModel = req.model;
    let prompt = 0;
    let cached = 0;
    let output = 0;

    for await (const chunk of stream) {
      const text = chunk.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (text) yield { type: "text", text };
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason) stopReason = String(reason);
      if (chunk.modelVersion) servedModel = chunk.modelVersion;
      const meta = chunk.usageMetadata;
      if (meta) {
        prompt = meta.promptTokenCount ?? prompt;
        cached = meta.cachedContentTokenCount ?? cached;
        // Tokens de "thinking" são cobrados como saída.
        output = (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
      }
    }

    yield {
      type: "finish",
      servedModel,
      stopReason,
      refused: stopReason === "SAFETY" || stopReason === "PROHIBITED_CONTENT",
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
