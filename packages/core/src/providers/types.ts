import type { ChatMessage, NormalizedUsage, ProviderId } from "../types";

export type Effort = "low" | "medium" | "high" | "xhigh";

export interface ProviderStreamRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  apiKey: string;
  /** Profundidade de raciocínio (aplicada onde o provedor suporta). */
  effort?: Effort;
  signal?: AbortSignal;
}

/** Uso atribuído a cada modelo que efetivamente rodou (fallbacks podem trocar o modelo). */
export interface ModelUsage {
  model: string;
  usage: NormalizedUsage;
}

export type ProviderStreamEvent =
  | { type: "text"; text: string }
  | {
      type: "finish";
      servedModel: string;
      stopReason: string | null;
      refused: boolean;
      usageByModel: ModelUsage[];
    };

export interface ProviderAdapter {
  id: ProviderId;
  stream(req: ProviderStreamRequest): AsyncIterable<ProviderStreamEvent>;
}
