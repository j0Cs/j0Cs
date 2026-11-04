/**
 * OpenAI GPT-Live: sessão de voz full-duplex via WebRTC criada PELO SERVIDOR (a chave
 * nunca vai ao navegador). Com delegação "client", o raciocínio volta para nós e passa
 * pelo nosso gateway (qualquer modelo, cobrado por token).
 *
 * ⚠️ Endpoint novo (GA em 10/09/2026): formatos conferidos na documentação em 04/11/2026,
 * ainda não exercitados com uma chave real neste projeto.
 */
/** OPENAI_BASE_URL permite apontar para um servidor de teste (mesma convenção do SDK oficial). */
const raiz = () => (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const base = () => `${raiz()}/live/sessions`;
/** Nenhuma chamada de desligamento pode prender a varredura: tudo com prazo. */
const PRAZO_REST_MS = 5_000;

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
 * o `session.closed` (que traz o motivo e o uso final em segundos).
 * `abriu` diz se o canal chegou a conectar: se abriu e o `session.closed` não veio, a sessão
 * existia e continua sem confirmação de fim.
 */
export async function closeLiveSession(input: {
  apiKey: string;
  sessionId: string;
  timeoutMs?: number;
  WebSocketImpl?: typeof WebSocket;
}): Promise<{ ok: boolean; abriu: boolean; reason?: string; usageSeconds?: number }> {
  const Ws = input.WebSocketImpl ?? globalThis.WebSocket;
  if (!Ws) return { ok: false, abriu: false };
  const url = `${base().replace(/^http/, "ws")}/${encodeURIComponent(input.sessionId)}/attach`;
  return new Promise((resolve) => {
    let fim = false;
    let abriu = false;
    let ws: WebSocket | undefined;
    const terminar = (r: { ok: boolean; reason?: string; usageSeconds?: number }) => {
      if (fim) return;
      fim = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // já fechado
      }
      resolve({ ...r, abriu });
    };
    const timer = setTimeout(() => terminar({ ok: false }), input.timeoutMs ?? 6_000);
    try {
      // `headers` é extensão do WebSocket do Node (undici); o do navegador não aceita
      ws = new Ws(url, { headers: { authorization: `Bearer ${input.apiKey}` } } as unknown as string[]);
    } catch {
      terminar({ ok: false });
      return;
    }
    ws.onopen = () => {
      abriu = true;
      ws?.send(JSON.stringify({ type: "session.close" }));
    };
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
 * Plano B: endpoint REST de desligamento. A documentação o cita ("called the hangup endpoint"),
 * mas a referência lida não detalha o caminho para WebRTC. Devolve o status HTTP (0 = sem resposta).
 * Atenção: a OpenAI responde 404 antes de checar a chave em rotas de sessão, então 404 pode ser
 * "já encerrada", "rota inexistente" ou "chave revogada".
 */
export async function hangupLiveSession(input: { apiKey: string; sessionId: string; fetchImpl?: typeof fetch }): Promise<number> {
  const f = input.fetchImpl ?? fetch;
  try {
    const res = await f(`${base()}/${encodeURIComponent(input.sessionId)}/hangup`, {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(PRAZO_REST_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

/** A chave ainda é aceita pela OpenAI? (desempata um 404 ambíguo). null = não deu para saber. */
async function chaveAceita(apiKey: string, fetchImpl?: typeof fetch): Promise<boolean | null> {
  const f = fetchImpl ?? fetch;
  try {
    const res = await f(`${raiz()}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(PRAZO_REST_MS) });
    if (res.status === 401 || res.status === 403) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

export type FimDaSessao =
  | { ok: true; via: "sideband"; confirmado: true; reason?: string; usageSeconds?: number }
  | { ok: true; via: "hangup"; confirmado: boolean; status: number }
  | { ok: false; status?: number; chaveRecusada?: boolean };

/**
 * Desliga a sessão: canal lateral primeiro, REST como reserva.
 * - canal lateral confirmou (session.closed) → ok, confirmado;
 * - REST 2xx ou 409 → ok, confirmado;
 * - REST 404 depois de o canal lateral ABRIR sem fechar → a sessão estava viva: ok false (tentar de novo);
 * - REST 404 sem o canal ter aberto → provavelmente já encerrada (o navegador manda session.close antes):
 *   confirma que a chave ainda vale; se a chave foi recusada, devolve chaveRecusada.
 */
export async function endLiveSession(input: {
  apiKey: string;
  sessionId: string;
  timeoutMs?: number;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
}): Promise<FimDaSessao> {
  const lateral = await closeLiveSession(input);
  if (lateral.ok) return { ok: true, via: "sideband", confirmado: true, reason: lateral.reason, usageSeconds: lateral.usageSeconds };
  const status = await hangupLiveSession(input);
  if ((status >= 200 && status < 300) || status === 409) return { ok: true, via: "hangup", confirmado: true, status };
  if (status === 404 && !lateral.abriu) {
    const aceita = await chaveAceita(input.apiKey, input.fetchImpl);
    if (aceita === false) return { ok: false, status, chaveRecusada: true };
    if (aceita === true) return { ok: true, via: "hangup", confirmado: false, status };
  }
  return { ok: false, status };
}
