/**
 * As ferramentas que mandam uso para a Forja e como cada uma descreve uma requisição ao modelo.
 * Fontes: docs de monitoramento do Claude Code (code.claude.com/docs/en/monitoring-usage), config do
 * Codex CLI ([otel] em ~/.codex/config.toml), telemetria do Gemini CLI (docs/cli/telemetry.md) e do
 * Grok Build (monitoring-usage). Só os eventos de requisição entram; prompts e respostas nunca.
 */
import { createHash } from "node:crypto";
import type { RegistroOtlp, ValorOtlp } from "./otlp";

export type Ferramenta = "claude_code" | "codex" | "gemini_cli" | "grok_build";

export const FERRAMENTAS: Record<Ferramenta, { nome: string; empresa: string; formato: string }> = {
  claude_code: { nome: "Claude Code", empresa: "Anthropic", formato: "JSON" },
  codex: { nome: "Codex CLI", empresa: "OpenAI", formato: "JSON" },
  gemini_cli: { nome: "Gemini CLI", empresa: "Google", formato: "JSON" },
  grok_build: { nome: "Grok Build", empresa: "xAI", formato: "protobuf" },
};

export interface UsoNormalizado {
  occurredAt: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsdMicros: number | null;
  durationMs: number | null;
  sessionId: string | null;
  querySource: string | null;
  actor: string | null;
  fingerprint: string;
}

const num = (v: ValorOtlp | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const txt = (v: ValorOtlp | undefined) => (typeof v === "string" && v ? v.slice(0, 200) : null);
const nomeIgual = (r: RegistroOtlp, ...alvos: string[]) => r.nomes.some((n) => alvos.some((a) => n === a || n.endsWith(`.${a}`)));

/** Atributo do registro ou do recurso (session.id e user.email às vezes vêm no recurso). */
const at = (r: RegistroOtlp, chave: string) => r.atributos[chave] ?? r.recurso[chave];

function impressao(partes: unknown[]) {
  return createHash("sha256").update(JSON.stringify(partes)).digest("hex").slice(0, 32);
}

/** Uma requisição ao modelo, ou null para qualquer outro evento (prompt, ferramenta, erro…). */
export function normalizar(ferramenta: Ferramenta, r: RegistroOtlp, agora = Date.now()): UsoNormalizado | null {
  let u: Omit<UsoNormalizado, "fingerprint" | "occurredAt" | "actor" | "sessionId"> | null = null;
  let idDaRequisicao: string | null = null;

  if (ferramenta === "claude_code" && nomeIgual(r, "api_request")) {
    // Anthropic: input_tokens já exclui o que veio do cache
    const custo = Number(at(r, "cost_usd_micros") ?? NaN);
    const custoUsd = Number(at(r, "cost_usd") ?? NaN);
    u = {
      model: txt(at(r, "model")) ?? "",
      inputTokens: num(at(r, "input_tokens")),
      outputTokens: num(at(r, "output_tokens")),
      cacheReadTokens: num(at(r, "cache_read_tokens")),
      cacheWriteTokens: num(at(r, "cache_creation_tokens")),
      reasoningTokens: 0,
      costUsdMicros: Number.isFinite(custo) ? Math.round(custo) : Number.isFinite(custoUsd) ? Math.round(custoUsd * 1e6) : null,
      durationMs: num(at(r, "duration_ms")) || null,
      querySource: txt(at(r, "query_source")),
    };
    idDaRequisicao = txt(at(r, "request_id"));
  } else if (ferramenta === "codex" && nomeIgual(r, "codex.sse_event", "sse_event") && at(r, "event.kind") === "response.completed") {
    // OpenAI: input inclui o cacheado; tool_token_count é o total (não conta)
    const entrada = num(at(r, "input_token_count"));
    const cache = num(at(r, "cached_token_count"));
    u = {
      model: txt(at(r, "model")) ?? txt(at(r, "slug")) ?? "",
      inputTokens: Math.max(0, entrada - cache),
      outputTokens: num(at(r, "output_token_count")),
      cacheReadTokens: cache,
      cacheWriteTokens: num(at(r, "cache_write_token_count")),
      reasoningTokens: num(at(r, "reasoning_token_count")),
      costUsdMicros: null,
      durationMs: num(at(r, "duration_ms")) || null,
      querySource: null,
    };
  } else if (ferramenta === "gemini_cli" && nomeIgual(r, "gemini_cli.api_response", "api_response")) {
    // Gemini: o prompt inclui o conteúdo em cache
    const entrada = num(at(r, "input_token_count"));
    const cache = num(at(r, "cached_content_token_count"));
    u = {
      model: txt(at(r, "model")) ?? "",
      inputTokens: Math.max(0, entrada - cache),
      outputTokens: num(at(r, "output_token_count")),
      cacheReadTokens: cache,
      cacheWriteTokens: 0,
      reasoningTokens: num(at(r, "thoughts_token_count")),
      costUsdMicros: null,
      durationMs: num(at(r, "duration_ms")) || null,
      querySource: null,
    };
    idDaRequisicao = txt(at(r, "response_id")) ?? txt(at(r, "prompt_id"));
  } else if (ferramenta === "grok_build" && nomeIgual(r, "grok_code.api_request", "api_request")) {
    // xAI segue o formato da OpenAI: o cache faz parte da entrada
    const entrada = num(at(r, "input_tokens"));
    const cache = num(at(r, "cache_read_tokens"));
    u = {
      model: txt(at(r, "model")) ?? "",
      inputTokens: Math.max(0, entrada - cache),
      outputTokens: num(at(r, "output_tokens")),
      cacheReadTokens: cache,
      cacheWriteTokens: 0,
      reasoningTokens: num(at(r, "reasoning_tokens")),
      costUsdMicros: null,
      durationMs: num(at(r, "duration_ms")) || null,
      querySource: null,
    };
    idDaRequisicao = txt(at(r, "request_id"));
  }
  if (!u) return null;
  if (!u.inputTokens && !u.outputTokens && !u.cacheReadTokens && !u.cacheWriteTokens) return null;

  // horário: o do registro, sem aceitar futuro nem mais de 30 dias atrás
  const tempo = r.tempoMs && r.tempoMs <= agora + 5 * 60_000 && r.tempoMs >= agora - 30 * 86_400_000 ? r.tempoMs : agora;
  const sessionId = txt(at(r, "session.id")) ?? txt(at(r, "conversation.id"));
  return {
    ...u,
    occurredAt: new Date(tempo),
    sessionId,
    actor: txt(at(r, "user.email")),
    fingerprint: idDaRequisicao
      ? impressao(["req", idDaRequisicao])
      : impressao([r.tempoMs, sessionId, u.model, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.reasoningTokens]),
  };
}
