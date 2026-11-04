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

  it("hangup trata sessão já encerrada como sucesso", async () => {
    const f = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await hangupLiveSession({ apiKey: "sk", sessionId: "live_1", fetchImpl: f as unknown as typeof fetch })).toBe(true);
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

  it("encerra pelo canal lateral com session.close e lê o uso final", async () => {
    const { conexoes, Impl } = fakeWs("fecha");
    const r = await closeLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl });
    expect(r).toEqual({ ok: true, reason: "close_requested", usageSeconds: 42 });
    expect(conexoes[0]!.url).toBe("wss://api.openai.com/v1/live/sessions/live_1/attach");
    expect(conexoes[0]!.opts).toEqual({ headers: { authorization: "Bearer sk" } });
    expect(conexoes[0]!.enviados.map((d) => JSON.parse(d).type)).toEqual(["session.close"]);
  });

  it("sem session.closed no prazo, não confirma o desligamento", async () => {
    const { Impl } = fakeWs("silencio");
    expect(await closeLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl, timeoutMs: 20 })).toEqual({ ok: false });
  });

  it("canal lateral recusado: cai no hangup REST", async () => {
    const { Impl } = fakeWs("recusa");
    const f = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, via: "hangup" });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.openai.com/v1/live/sessions/live_1/hangup");
  });

  it("nenhum caminho confirmou: devolve ok false para a varredura tentar de novo", async () => {
    const { Impl } = fakeWs("recusa");
    const f = vi.fn(async () => new Response(null, { status: 400 }));
    expect(await endLiveSession({ apiKey: "sk", sessionId: "live_1", WebSocketImpl: Impl, fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: false });
  });
});
