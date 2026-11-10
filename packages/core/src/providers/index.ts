import type { ProviderId } from "../types";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter, xaiAdapter } from "./openai";
import type { ProviderAdapter } from "./types";

export const DEFAULT_ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  xai: xaiAdapter,
};

export * from "./types";
