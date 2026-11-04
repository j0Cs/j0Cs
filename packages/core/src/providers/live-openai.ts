/**
 * OpenAI GPT-Live: sessão de voz full-duplex via WebRTC criada PELO SERVIDOR (a chave
 * nunca vai ao navegador). Com delegação "client", o raciocínio volta para nós e passa
 * pelo nosso gateway (qualquer modelo, cobrado por token).
 *
 * ⚠️ Endpoint novo (GA em 10/09/2026): formatos conferidos na documentação em 04/11/2026,
 * ainda não exercitados com uma chave real neste projeto.
 */
/** OPENAI_BASE_URL permite apontar para um servidor de teste (mesma convenção do SDK oficial). */
const base = () => `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/live/sessions`;

export interface LiveSessionInput {
  apiKey: string;
  sdpOffer: string;
  instructions: string;
  voice: string;
  model?: string;
  /** Eventos que o navegador pode enviar pelo data channel (trava o front-end). */
  allowedClientEvents?: string[];
  fetchImpl?: typeof fetch;
}

export async function createLiveSession(input: LiveSessionInput): Promise<{ sessionId: string; sdpAnswer: string }> {
  const f = input.fetchImpl ?? fetch;
  const res = await f(base(), {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      session: {
        model: input.model ?? "gpt-live-1",
        instructions: input.instructions,
        audio: { output: { voice: input.voice } },
        delegation: { type: "client", acknowledgement_delay_ms: 0 },
        store: false,
        ...(input.allowedClientEvents
          ? { client: { data_channel: { allowed_client_events: input.allowedClientEvents } } }
          : {}),
      },
      transport: { type: "webrtc", sdp: input.sdpOffer },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    session?: { id?: string };
    transport?: { sdp?: string };
    error?: { message?: string };
  };
  if (!res.ok || !body.session?.id || !body.transport?.sdp) {
    throw new Error(`OpenAI GPT-Live recusou a sessão (${res.status}): ${body.error?.message ?? "sem detalhes"}`);
  }
  return { sessionId: body.session.id, sdpAnswer: body.transport.sdp };
}

/**
 * Encerra a sessão pelo canal lateral (sideband), o caminho documentado para sessões WebRTC:
 * conecta em `wss://…/live/sessions/{id}/attach` com a chave, envia `session.close` e espera
 * o `session.closed` (que traz o motivo e o uso final em segundos). Resolve `ok: false` se
 * não conseguir conectar ou se o `session.closed` não chegar a tempo.
 */
export async function closeLiveSession(input: {
  apiKey: string;
  sessionId: string;
  timeoutMs?: number;
  WebSocketImpl?: typeof WebSocket;
}): Promise<{ ok: boolean; reason?: string; usageSeconds?: number }> {
  const Ws = input.WebSocketImpl ?? globalThis.WebSocket;
  if (!Ws) return { ok: false };
  const url = `${base().replace(/^http/, "ws")}/${encodeURIComponent(input.sessionId)}/attach`;
  return new Promise((resolve) => {
    let fim = false;
    let ws: WebSocket;
    const terminar = (r: { ok: boolean; reason?: string; usageSeconds?: number }) => {
      if (fim) return;
      fim = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // já fechado
      }
      resolve(r);
    };
    const timer = setTimeout(() => terminar({ ok: false }), input.timeoutMs ?? 8_000);
    try {
      // `headers` é extensão do WebSocket do Node (undici); o do navegador não aceita
      ws = new Ws(url, { headers: { authorization: `Bearer ${input.apiKey}` } } as unknown as string[]);
    } catch {
      terminar({ ok: false });
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify({ type: "session.close" }));
    ws.onmessage = (m) => {
      let e: { type?: string; reason?: string; usage?: { seconds?: number } };
      try {
        e = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (e.type === "session.closed") terminar({ ok: true, reason: e.reason, usageSeconds: e.usage?.seconds });
    };
    ws.onerror = () => terminar({ ok: false });
    ws.onclose = () => terminar({ ok: false });
  });
}

/**
 * Plano B: endpoint REST de desligamento. A documentação o cita ("called the hangup
 * endpoint") mas a referência lida não detalha o caminho para WebRTC. 404/409 = já encerrada.
 */
export async function hangupLiveSession(input: { apiKey: string; sessionId: string; fetchImpl?: typeof fetch }) {
  const f = input.fetchImpl ?? fetch;
  const res = await f(`${base()}/${encodeURIComponent(input.sessionId)}/hangup`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}` },
  });
  return res.ok || res.status === 404 || res.status === 409;
}

/** Desliga a sessão: canal lateral primeiro, REST como reserva. true = confirmado. */
export async function endLiveSession(input: { apiKey: string; sessionId: string; timeoutMs?: number; WebSocketImpl?: typeof WebSocket; fetchImpl?: typeof fetch }) {
  const lateral = await closeLiveSession(input);
  if (lateral.ok) return { ok: true as const, via: "sideband" as const, reason: lateral.reason, usageSeconds: lateral.usageSeconds };
  const rest = await hangupLiveSession(input).catch(() => false);
  return rest ? { ok: true as const, via: "hangup" as const } : { ok: false as const };
}
