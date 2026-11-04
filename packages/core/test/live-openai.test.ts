import { describe, expect, it, vi } from "vitest";
import { createLiveSession, hangupLiveSession } from "../src/providers/live-openai";

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
});
