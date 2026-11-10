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
  /** Uma rodada do agente com ferramentas. Ausente = o provedor não roda tarefas de agente. */
  complete?(req: ProviderToolRequest): Promise<ProviderToolResponse>;
}

// ---------------------------------------------------------------------------
// Agente: chamada com ferramentas (sem streaming), num formato comum aos provedores
// ---------------------------------------------------------------------------

export interface AgentToolDef {
  name: string;
  description: string;
  /** JSON Schema dos argumentos. */
  inputSchema: Record<string, unknown>;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentToolResult {
  id: string;
  name: string;
  output: string;
  isError?: boolean;
}

export type AgentMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      toolCalls: AgentToolCall[];
      /** Conteúdo original do provedor (blocos de raciocínio etc.), reenviado igual ao mesmo provedor. */
      raw?: { provider: ProviderId; content: unknown };
    }
  | { role: "tool"; results: AgentToolResult[] };

export interface ProviderToolRequest {
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: AgentToolDef[];
  apiKey: string;
  effort?: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ProviderToolResponse {
  message: Extract<AgentMessage, { role: "assistant" }>;
  servedModel: string;
  stopReason: string | null;
  refused: boolean;
  usageByModel: ModelUsage[];
}
