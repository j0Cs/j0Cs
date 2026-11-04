import { describe, expect, it, vi } from "vitest";
import { closeLiveSession, createLiveSession, endLiveSession, hangupLiveSession } from "../src/providers/live-openai";

describe("GPT-Live", () => {
  it("cria a sessão no servidor com delegação para o cliente e devolve o SDP de resposta", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ session: { id: "live_1" }, transport: { type: "webrtc", sdp: "v=0 answer" } }), { status: 201 }));
    const r = await createLiveSession({ apiKey: "sk", sdpOffer: "v=0 offer", instructions: "oi", voice: "bossa", fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ sessionId: "live_1", sdpAnswer: "v=0 answer" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/live/sessions");
    const body = JSON.parse(String(init.body));
    expect(body.session.delegation.type).toBe("client");
    expect(body.session.audio.output.voice).toBe("bossa");
    expect(body.transport).toEqual({ type: "webrtc", sdp: "v=0 offer" });
  });

  it("propaga a recusa do provedor", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }));
    await expect(createLiveSession({ apiKey: "sk", sdpOffer: "x", instructions: "", voice: "bossa", fetchImpl: f as unknown as typeof fetch })).rejects.toThrow(/429.*quota/);
  });

  it("hangup devolve o status HTTP (0 sem resposta)", async () => {
    const f404 = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await hangupLiveSession({ apiKey: "sk", sessionId: "live_1", fetchImpl: f404 as unknown as typeof fetch })).toBe(404);
    const falha = vi.fn(async () => {
      throw new TypeError("rede");
    });
    expect(await hangupLiveSession({ apiKey: "sk", sessionId: "live_1", fetchImpl: falha as unknown as typeof fetch })).toBe(0);
  });

  /** WebSocket falso: registra conexão e mensagens; `responde` define o que o "provedor" faz. */
  function fakeWs(responde: "fecha" | "silencio" | "recusa") {
    const conexoes: { url: string; opts: unknown; enviados: string[] }[] = [];
    class Fake {
      onopen: (() => void) | null = null;
      onmessage: ((m: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      private c: { url: string; opts: unknown; enviados: string[] };
      constructor(url: string, opts: unknown) {
        this.c = { url, opts, enviados: [] };
        conexoes.push(this.c);
        setTimeout(() => (responde === "recusa" ? this.onerror?.() : this.onopen?.()), 0);
      }
      send(d: string) {
        this.c.enviados.push(d);
        if (responde === "fecha") {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: "session.closed", reason: "close_requested", usage: { seconds: 42 } }) }), 0);
        }
      }
      close() {}
    }
    return { conexoes, Impl: Fake as unknown as typeof WebSocket };
  }

  /** fetch falso que responde por rota: hangup e /models (checagem da chave). */
  const rotas = (hangup: number, models: number) =>
    vi.fn(async (url: string) => new Response(null, { status: String(url).endsWith("/models") ? models : hangup }));
  const urls = (f: ReturnType<typeof rotas>) => f.mock.calls.map((c) => String((c as unknown as [string])[0]));

  it("encerra pelo canal lateral com session.close e lê o uso final", async () => {
    const { conexoes, Impl } = fakeWs("fecha");
    const r = await closeLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl });
    expect(r).toEqual({ ok: true, abriu: true, reason: "close_requested", usageSeconds: 42 });
    expect(conexoes[0]!.url).toBe("wss://api.openai.com/v1/live/sessions/live_1/attach");
    expect(conexoes[0]!.opts).toEqual({ headers: { authorization: "Bearer sk" } });
    expect(conexoes[0]!.enviados.map((d) => JSON.parse(d).type)).toEqual(["session.close"]);
  });

  it("sem session.closed no prazo, não confirma o desligamento", async () => {
    const { Impl } = fakeWs("silencio");
    expect(await closeLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl, timeoutMs: 20 })).toEqual({ ok: false, abriu: true });
  });

  it("canal lateral confirmou: nem chama o REST", async () => {
    const f = rotas(500, 500);
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: fakeWs("fecha").Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, via: "sideband", confirmado: true, reason: "close_requested", usageSeconds: 42 });
    expect(f).not.toHaveBeenCalled();
  });

  it("canal lateral recusado e REST 200: desligado pelo hangup", async () => {
    const f = rotas(200, 200);
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: fakeWs("recusa").Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, via: "hangup", confirmado: true, status: 200 });
    expect(urls(f)).toEqual(["https://api.openai.com/v1/live/sessions/live_1/hangup"]);
  });

  it("canal lateral ABRIU mas não fechou e o REST dá 404: a sessão estava viva, não confirma", async () => {
    const f = rotas(404, 200);
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", timeoutMs: 20, WebSocketImpl: fakeWs("silencio").Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, status: 404 });
  });

  it("canal lateral recusado e REST 404 com a chave válida: provavelmente já encerrada (sem confirmação)", async () => {
    const f = rotas(404, 200);
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: fakeWs("recusa").Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, via: "hangup", confirmado: false, status: 404 });
    expect(urls(f)).toEqual(["https://api.openai.com/v1/live/sessions/live_1/hangup", "https://api.openai.com/v1/models"]);
  });

  it("canal lateral recusado e REST 404 com a chave recusada: avisa que a chave caiu", async () => {
    const f = rotas(404, 401);
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: fakeWs("recusa").Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, status: 404, chaveRecusada: true });
  });

  it("nenhum caminho confirmou: ok false para a varredura tentar de novo", async () => {
    const f = rotas(400, 200);
    expect(await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: fakeWs("recusa").Impl, fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: false, status: 400 });
  });
});
