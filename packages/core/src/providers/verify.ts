import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ProviderId } from "../types";

/** Testa uma chave de API com uma chamada gratuita (listar modelos). */
export async function verifyProviderKey(providerId: ProviderId, apiKey: string): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (providerId) {
      case "anthropic": {
        const page = await new Anthropic({ apiKey }).models.list({ limit: 5 });
        return { ok: true, detail: `${page.data.length}+ modelos visíveis` };
      }
      case "openai":
      case "xai": {
        const client = new OpenAI({ apiKey, ...(providerId === "xai" ? { baseURL: "https://api.x.ai/v1" } : {}) });
        const page = await client.models.list();
        return { ok: true, detail: `${page.data.length} modelos visíveis` };
      }
      case "google": {
        const pager = await new GoogleGenAI({ apiKey }).models.list({ config: { pageSize: 5 } });
        return { ok: true, detail: `${pager.page.length}+ modelos visíveis` };
      }
    }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : "falha desconhecida" };
  }
}
