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

/** Encerra a sessão no provedor (corte por saldo, abandono ou fim normal). Idempotente na prática. */
export async function hangupLiveSession(input: { apiKey: string; sessionId: string; fetchImpl?: typeof fetch }) {
  const f = input.fetchImpl ?? fetch;
  const res = await f(`${base()}/${encodeURIComponent(input.sessionId)}/hangup`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}` },
  });
  // 404/409 = já encerrada: tudo bem
  return res.ok || res.status === 404 || res.status === 409;
}
