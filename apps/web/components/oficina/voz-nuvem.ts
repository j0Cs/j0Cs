/**
 * Chamada de voz em nuvem (OpenAI GPT-Live via WebRTC).
 *
 * - A sessão é criada pelo NOSSO servidor (/api/call/voz/sessao): a chave nunca chega aqui.
 * - O modelo de voz conversa em full-duplex (ouve enquanto fala) e DELEGA o raciocínio:
 *   quando chega `session.delegation.created`, pedimos a resposta ao nosso gateway
 *   (o modelo escolhido pelo cliente, cobrado por token) e devolvemos o texto para ele falar.
 * - A cada 15 s um pulso cobra o tempo de voz; o servidor corta quando o saldo acaba.
 *
 * ⚠️ Nomes de eventos conferidos na documentação (04/11/2026), ainda não exercitados com
 * uma chave real — todos estão concentrados em EVENTOS para ajuste rápido.
 */

export const EVENTOS = {
  iniciada: "session.started",
  transcricaoUsuario: "session.input_transcript.delta",
  transcricaoAgente: "session.output_transcript.delta",
  delegacao: "session.delegation.created",
  encerrada: "session.closed",
  responderFalado: "session.commentary.append",
  silenciar: "session.input_audio.mute",
  reativar: "session.input_audio.unmute",
  fechar: "session.close",
} as const;

/** Erro com mensagem já pronta para a pessoa (vinda da nossa API). */
export class ErroDeVoz extends Error {}

export interface EventosNuvem {
  /** Legenda ao vivo (parcial) de quem está falando. */
  onLegenda(quem: "voce" | "agente", texto: string): void;
  /** Fala concluída (após uma pausa), para a transcrição. */
  onFala(quem: "voce" | "agente", texto: string): void;
  /** O modelo de voz pediu raciocínio ao backend. */
  onDelegacao(id: string, pedido: string): void;
  onEncerrada(motivo: string): void;
  onCobranca(brlMicros: number): void;
  onErro(mensagem: string): void;
}

export interface ChamadaNuvem {
  iniciar(projeto: string): Promise<{ projectId: string; conversationId: string }>;
  responder(delegacaoId: string, texto: string): void;
  silenciar(mudo: boolean): void;
  nivelUsuario(): number;
  nivelAgente(): number;
  encerrar(): Promise<void>;
}

function medidor(stream: MediaStream, ctx: AudioContext) {
  const a = ctx.createAnalyser();
  a.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(a);
  const buf = new Uint8Array(a.fftSize);
  return () => {
    a.getByteTimeDomainData(buf);
    let soma = 0;
    for (const v of buf) soma += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(soma / buf.length) * 5);
  };
}

/** Agrupa os pedaços de transcrição em falas, fechando após uma pausa. */
function agrupador(onParcial: (t: string) => void, onFim: (t: string) => void, pausaMs = 1200) {
  let texto = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (delta: string) => {
    texto += delta;
    onParcial(texto.trim());
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const t = texto.trim();
      texto = "";
      if (t) onFim(t);
    }, pausaMs);
  };
}

export function criarChamadaNuvem(ev: EventosNuvem): ChamadaNuvem {
  let pc: RTCPeerConnection | null = null;
  let canal: RTCDataChannel | null = null;
  let mic: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let audio: HTMLAudioElement | null = null;
  let nivelMic: () => number = () => 0;
  let nivelVoz: () => number = () => 0;
  let sessaoId: string | null = null;
  let pulso: ReturnType<typeof setInterval> | null = null;
  let encerrada = false;
  // falas do usuário desde a última delegação: viram o pedido ao backend
  let pendentes: string[] = [];

  const enviar = (obj: Record<string, unknown>) => {
    if (canal?.readyState === "open") canal.send(JSON.stringify(obj));
  };

  const agruparUsuario = agrupador(
    (t) => ev.onLegenda("voce", t),
    (t) => {
      pendentes.push(t);
      ev.onFala("voce", t);
    },
  );
  const agruparAgente = agrupador(
    (t) => ev.onLegenda("agente", t),
    (t) => ev.onFala("agente", t),
  );

  const finalizar = async (motivo: string) => {
    if (encerrada) return;
    encerrada = true;
    if (pulso) clearInterval(pulso);
    enviar({ type: EVENTOS.fechar });
    if (sessaoId) {
      await fetch("/api/call/voz/fim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessaoId }),
      })
        .then((r) => r.json())
        .then((d: { cobrado?: number }) => d.cobrado && ev.onCobranca(d.cobrado))
        .catch(() => undefined);
    }
    pc?.close();
    mic?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    audio?.remove();
    ev.onEncerrada(motivo);
  };

  return {
    async iniciar(projeto) {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ctx = new AudioContext();
      nivelMic = medidor(mic, ctx);

      pc = new RTCPeerConnection();
      mic.getAudioTracks().forEach((t) => pc!.addTrack(t, mic!));
      audio = document.createElement("audio");
      audio.autoplay = true;
      pc.ontrack = (e) => {
        const [remoto] = e.streams;
        if (!remoto || !audio || !ctx) return;
        audio.srcObject = remoto;
        nivelVoz = medidor(remoto, ctx);
      };
      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
          void finalizar("A conexão de voz caiu.");
        }
      };

      canal = pc.createDataChannel("oai-events");
      canal.onmessage = (m) => {
        let e: { type?: string; delta?: string; reason?: string; delegation?: { id?: string; input?: string; query?: string } };
        try {
          e = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (e.type === EVENTOS.transcricaoUsuario && e.delta) agruparUsuario(e.delta);
        else if (e.type === EVENTOS.transcricaoAgente && e.delta) agruparAgente(e.delta);
        else if (e.type === EVENTOS.delegacao && e.delegation?.id) {
          const pedido = e.delegation.input ?? e.delegation.query ?? pendentes.join(" ");
          pendentes = [];
          ev.onDelegacao(e.delegation.id, pedido);
        } else if (e.type === EVENTOS.encerrada) {
          void finalizar(e.reason === "content" ? "A chamada foi encerrada pelo filtro de conteúdo." : "Chamada encerrada.");
        }
      };

      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      const res = await fetch("/api/call/voz/sessao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sdp: oferta.sdp, projeto }),
      });
      const dados = (await res.json()) as { erro?: string; sessaoId?: string; sdp?: string; projectId?: string; conversationId?: string };
      const liberar = () => {
        pc?.close();
        mic?.getTracks().forEach((t) => t.stop());
        void ctx?.close();
      };
      if (!res.ok || !dados.sdp || !dados.sessaoId) {
        liberar();
        throw new ErroDeVoz(dados.erro ?? "Não foi possível abrir a chamada agora.");
      }
      sessaoId = dados.sessaoId;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: dados.sdp });
      } catch (err) {
        // a sessão existe no provedor mas a conexão não fechou: encerra sem cobrar o cliente
        console.error("[voz] falha ao conectar", err);
        await fetch("/api/call/voz/fim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessaoId, falhou: true }),
        }).catch(() => undefined);
        liberar();
        throw new ErroDeVoz("Não foi possível conectar a voz natural agora.");
      }

      pulso = setInterval(async () => {
        try {
          const r = await fetch("/api/call/voz/pulso", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessaoId }),
          });
          const d = (await r.json()) as { encerrar?: boolean; motivo?: string; cobrado?: number };
          if (d.cobrado) ev.onCobranca(d.cobrado);
          if (d.encerrar) void finalizar(d.motivo ?? "Chamada encerrada.");
        } catch {
          // um pulso perdido não derruba a chamada; a varredura do servidor cobre a ausência
        }
      }, 15_000);

      return { projectId: dados.projectId!, conversationId: dados.conversationId! };
    },

    responder(delegacaoId, texto) {
      enviar({ type: EVENTOS.responderFalado, delegation_id: delegacaoId, text: texto });
    },

    silenciar(mudo) {
      mic?.getAudioTracks().forEach((t) => (t.enabled = !mudo));
      enviar({ type: mudo ? EVENTOS.silenciar : EVENTOS.reativar });
    },

    nivelUsuario: () => nivelMic(),
    nivelAgente: () => nivelVoz(),

    encerrar: () => finalizar("Chamada encerrada."),
  };
}
