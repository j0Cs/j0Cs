import { gzipSync } from "node:zlib";
import { JsonLogsSerializer, ProtobufLogsSerializer } from "@opentelemetry/otlp-transformer";
import { describe, expect, it } from "vitest";
import { normalizar } from "../src/ferramentas";
import { corpoDoLote, lerLogs, lerLogsJson, lerLogsProtobuf } from "../src/otlp";

/** Registro no formato do SDK do OpenTelemetry (o que os exportadores oficiais serializam). */
function registro(nome: string, atributos: Record<string, string | number | boolean>, corpo?: string) {
  const agora = Date.now();
  return {
    hrTime: [Math.floor(agora / 1000), (agora % 1000) * 1e6] as [number, number],
    hrTimeObserved: [Math.floor(agora / 1000), (agora % 1000) * 1e6] as [number, number],
    severityNumber: 9,
    severityText: "INFO",
    body: corpo ?? nome,
    eventName: undefined,
    resource: { attributes: { "service.name": "teste", "session.id": "sessao-1" }, asyncAttributesPending: false, merge: () => undefined } as never,
    instrumentationScope: { name: "teste", version: "1" },
    attributes: { "event.name": nome, ...atributos },
    droppedAttributesCount: 0,
  };
}

const ccAtributos = {
  model: "claude-sonnet-5-5",
  input_tokens: 1200,
  output_tokens: 340,
  cache_read_tokens: 48_000,
  cache_creation_tokens: 2_000,
  cost_usd: 0.0321,
  duration_ms: 5120,
  request_id: "req_abc",
  query_source: "main",
  "user.email": "dev@empresa.test",
};

describe("leitura de OTLP", () => {
  it("protobuf do codificador oficial", () => {
    const bytes = ProtobufLogsSerializer.serializeRequest([registro("claude_code.api_request", ccAtributos)] as never)!;
    const [r] = lerLogsProtobuf(Buffer.from(bytes));
    expect(r!.nomes).toContain("claude_code.api_request");
    expect(r!.atributos.input_tokens).toBe(1200);
    expect(r!.atributos.cost_usd).toBeCloseTo(0.0321);
    expect(r!.atributos.model).toBe("claude-sonnet-5-5");
    expect(r!.recurso["session.id"]).toBe("sessao-1");
    expect(Math.abs(r!.tempoMs! - Date.now())).toBeLessThan(5_000);
  });

  it("JSON do codificador oficial (int64 como texto)", () => {
    const bytes = JsonLogsSerializer.serializeRequest([registro("gemini_cli.api_response", { model: "gemini-3-pro", input_token_count: 900, cached_content_token_count: 400, output_token_count: 50 })] as never)!;
    const [r] = lerLogsJson(Buffer.from(bytes).toString("utf8"));
    expect(r!.nomes).toContain("gemini_cli.api_response");
    expect(r!.atributos.input_token_count).toBe(900);
  });

  it("gzip e escolha pelo content-type", () => {
    const bytes = Buffer.from(ProtobufLogsSerializer.serializeRequest([registro("x", { a: 1 })] as never)!);
    expect(lerLogs(corpoDoLote(gzipSync(bytes), "gzip"), "application/x-protobuf")).toHaveLength(1);
    expect(() => lerLogs(Buffer.from("{nao-json"), "application/json")).toThrow(/JSON inválido/);
    expect(() => lerLogsProtobuf(Buffer.from([0x0a, 0xff, 0x01]))).toThrow(/truncado/);
  });
});

describe("normalização por ferramenta", () => {
  const ler = (nome: string, a: Record<string, string | number | boolean>) =>
    lerLogsProtobuf(Buffer.from(ProtobufLogsSerializer.serializeRequest([registro(nome, a)] as never)!))[0]!;

  it("Claude Code: entrada sem cache, custo da própria ferramenta e id da requisição", () => {
    const u = normalizar("claude_code", ler("claude_code.api_request", ccAtributos))!;
    expect(u).toMatchObject({ model: "claude-sonnet-5-5", inputTokens: 1200, cacheReadTokens: 48_000, cacheWriteTokens: 2_000, costUsdMicros: 32_100, querySource: "main", actor: "dev@empresa.test", sessionId: "sessao-1" });
    expect(normalizar("claude_code", ler("claude_code.api_request", ccAtributos))!.fingerprint).toBe(u.fingerprint);
  });

  it("Codex: só response.completed; o cache sai da entrada", () => {
    const base = { model: "gpt-6.1-codex", input_token_count: 10_000, cached_token_count: 8_000, output_token_count: 500, reasoning_token_count: 1_200, tool_token_count: 11_700 };
    expect(normalizar("codex", ler("codex.sse_event", { ...base, "event.kind": "response.output_text.delta" }))).toBeNull();
    expect(normalizar("codex", ler("codex.sse_event", { ...base, "event.kind": "response.completed" }))).toMatchObject({ inputTokens: 2_000, cacheReadTokens: 8_000, reasoningTokens: 1_200, outputTokens: 500 });
  });

  it("Gemini CLI e Grok Build", () => {
    expect(normalizar("gemini_cli", ler("gemini_cli.api_response", { model: "gemini-3-pro", input_token_count: 900, cached_content_token_count: 400, output_token_count: 50, thoughts_token_count: 70 }))).toMatchObject({ inputTokens: 500, cacheReadTokens: 400, reasoningTokens: 70 });
    expect(normalizar("grok_build", ler("grok_code.api_request", { model: "grok-5-code", input_tokens: 3_000, cache_read_tokens: 1_000, output_tokens: 200, reasoning_tokens: 90 }))).toMatchObject({ inputTokens: 2_000, cacheReadTokens: 1_000 });
  });

  it("outros eventos e eventos de outra ferramenta não contam", () => {
    expect(normalizar("claude_code", ler("claude_code.user_prompt", { prompt_length: 30 }))).toBeNull();
    expect(normalizar("gemini_cli", ler("claude_code.api_request", ccAtributos))).toBeNull();
  });
});
