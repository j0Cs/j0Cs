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
export class ErroDeVoz extends Error {
  constructor(
    message: string,
    /** A pessoa saiu ou encerrou antes de a conexão terminar: não é erro para mostrar. */
    public cancelada = false,
  ) {
    super(message);
  }
}

/** Tempo que um "disconnected" do WebRTC tem para voltar sozinho (perda curta de pacotes). */
const TOLERANCIA_QUEDA_MS = 10_000;
/**
 * Prazo para o WebRTC chegar a "connected" depois da troca de SDP (redes que bloqueiam UDP nunca
 * chegam). Abaixo dos 30 s em que o servidor ainda isenta uma conexão que falhou.
 */
const PRAZO_CONEXAO_MS = 15_000;

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
  /** Id da reserva, gerado aqui: o servidor usa o mesmo id, então dá para cancelar antes da resposta. */
  let sessaoId: string | null = null;
  /** A reserva já foi pedida ao servidor (a partir daí, sair da página precisa avisar). */
  let reservaEnviada = false;
  /** Acorda a espera pela conexão quando a chamada é encerrada no meio dela. */
  let acordarEspera: (() => void) | null = null;
  let pulso: ReturnType<typeof setInterval> | null = null;
  let queda: ReturnType<typeof setTimeout> | null = null;
  /** Encerrada (ou cancelada durante a conexão): nada mais pode ligar mic, pulso ou áudio. */
  let encerrada = false;
  let conectada = false;
  // falas do usuário desde a última delegação: viram o pedido ao backend
  let pendentes: string[] = [];

  const enviar = (obj: Record<string, unknown>) => {
    if (canal?.readyState === "open") canal.send(JSON.stringify(obj));
  };

  /** /fim já foi pedido para esta reserva (não repete). */
  let fimEnviado = false;
  // keepalive: o pedido sobrevive mesmo se a aba for fechada logo em seguida
  const avisarFim = (falhou: boolean) => {
    fimEnviado = true;
    return fetch("/api/call/voz/fim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessaoId, falhou }),
      keepalive: true,
    });
  };

  // aba fechada ou recarregada: avisa o servidor na hora (cobrança justa e desligamento imediato).
  // Vale desde o pedido da reserva: fechar a aba durante "Conectando…" também fecha a sessão.
  const aoSair = () => {
    if (encerrada || !reservaEnviada || fimEnviado) return;
    encerrada = true;
    fimEnviado = true;
    navigator.sendBeacon("/api/call/voz/fim", new Blob([JSON.stringify({ sessaoId, falhou: !conectada })], { type: "application/json" }));
  };

  /** Solta tudo o que foi alocado até agora. Idempotente. */
  const liberar = () => {
    if (pulso) clearInterval(pulso);
    if (queda) clearTimeout(queda);
    pulso = queda = null;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", aoSair);
    mic?.getTracks().forEach((t) => t.stop());
    pc?.close();
    ctx?.close().catch(() => undefined);
    audio?.remove();
    mic = pc = ctx = audio = canal = null;
    nivelMic = nivelVoz = () => 0;
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
    acordarEspera?.();
    if (pulso) clearInterval(pulso);
    // o microfone para na hora; a conexão fica aberta até o servidor confirmar o fim
    mic?.getTracks().forEach((t) => t.stop());
    if (reservaEnviada && !conectada && !fimEnviado) {
      // saiu durante "Conectando…": avisa já (sem esperar /sessao responder), com keepalive, para a
      // aba poder ser fechada em seguida sem deixar a sessão órfã
      void avisarFim(true).catch(() => undefined);
    }
    if (sessaoId && conectada) {
      // Quem desliga é o servidor (canal lateral): assim ele recebe o session.closed com os segundos
      // que a OpenAI cobrou. O session.close pelo canal de dados é só o plano B, se /fim falhar.
      const ok = await avisarFim(false)
        .then((r) => r.json())
        .then((d: { ok?: boolean; cobrado?: number }) => {
          if (d.cobrado) ev.onCobranca(d.cobrado);
          return d.ok === true;
        })
        .catch(() => false);
      if (!ok) enviar({ type: EVENTOS.fechar });
    }
    liberar();
    // encerrar() durante a conexão: quem chamou iniciar() recebe o cancelamento por lá
    if (conectada) ev.onEncerrada(motivo);
  };

  /** Saiu no meio da conexão: solta tudo e, se a reserva já foi pedida, fecha sem cobrar. */
  const cancelar = async (): Promise<never> => {
    liberar();
    if (reservaEnviada && !fimEnviado) await avisarFim(true).catch(() => undefined);
    throw new ErroDeVoz("Chamada cancelada.", true);
  };

  return {
    async iniciar(projeto) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (encerrada) return await cancelar();
        ctx = new AudioContext();
        nivelMic = medidor(mic, ctx);

        pc = new RTCPeerConnection();
        mic.getAudioTracks().forEach((t) => pc!.addTrack(t, mic!));
        audio = document.createElement("audio");
        audio.autoplay = true;
        pc.ontrack = (e) => {
          const [remoto] = e.streams;
          if (!remoto || !audio || !ctx || encerrada) return;
          audio.srcObject = remoto;
          nivelVoz = medidor(remoto, ctx);
        };
        pc.onconnectionstatechange = () => {
          // antes de conectar, quem decide é a espera da conexão (abaixo)
          if (!conectada) {
            acordarEspera?.();
            return;
          }
          const estado = pc?.connectionState;
          if (estado === "connected" && queda) {
            clearTimeout(queda);
            queda = null;
          } else if (estado === "failed") {
            void finalizar("A conexão de voz caiu.");
          } else if (estado === "disconnected" && !queda) {
            // perda curta de pacotes costuma se recuperar sozinha: só desliga se não voltar
            queda = setTimeout(() => void finalizar("A conexão de voz caiu."), TOLERANCIA_QUEDA_MS);
          }
        };

        canal = pc.createDataChannel("oai-events");
        canal.onmessage = (m) => {
          let e: {
            type?: string;
            delta?: string;
            reason?: string;
            id?: string;
            delegation_id?: string;
            delegation?: { id?: string; input?: string; query?: string };
          };
          try {
            e = JSON.parse(String(m.data));
          } catch {
            return;
          }
          if (encerrada) return;
          if (e.type === EVENTOS.transcricaoUsuario && e.delta) agruparUsuario(e.delta);
          else if (e.type === EVENTOS.transcricaoAgente && e.delta) agruparAgente(e.delta);
          else if (e.type === EVENTOS.delegacao) {
            // o id pode vir em delegation.id (documentado) ou no topo do evento: aceita os dois
            const id = e.delegation?.id ?? e.delegation_id ?? e.id;
            if (!id) return;
            const pedido = e.delegation?.input ?? e.delegation?.query ?? pendentes.join(" ");
            pendentes = [];
            ev.onDelegacao(id, pedido);
          } else if (e.type === EVENTOS.encerrada) {
            void finalizar(e.reason === "content" ? "A chamada foi encerrada pelo filtro de conteúdo." : "Chamada encerrada.");
          }
        };

        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);
        if (encerrada) return await cancelar();
        // A requisição NÃO é abortada ao cancelar: o servidor termina e /fim fecha a sessão pelo id.
        sessaoId = crypto.randomUUID();
        reservaEnviada = true;
        window.addEventListener("pagehide", aoSair, { once: true });
        const res = await fetch("/api/call/voz/sessao", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sdp: oferta.sdp, projeto, reserva: sessaoId }),
        });
        const dados = (await res.json().catch(() => ({}))) as {
          erro?: string;
          sessaoId?: string;
          sdp?: string;
          projectId?: string;
          conversationId?: string;
        };
        if (encerrada) return await cancelar();
        if (!res.ok || !dados.sdp || dados.sessaoId !== sessaoId) {
          liberar();
          await avisarFim(true).catch(() => undefined);
          throw new ErroDeVoz(dados.erro ?? "Não foi possível abrir a chamada agora.");
        }
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: dados.sdp });
        } catch (err) {
          // a sessão existe no provedor mas a conexão não fechou: encerra sem cobrar o cliente
          console.error("[voz] falha ao conectar", err);
          liberar();
          await avisarFim(true).catch(() => undefined);
          throw new ErroDeVoz("Não foi possível conectar a voz natural agora.");
        }
        if (encerrada) return await cancelar();
        // SDP aceito ainda não é conexão: só cobra (pulsos) depois de o áudio poder passar
        const conectou = await new Promise<boolean>((resolve) => {
          const prazo = setTimeout(() => {
            acordarEspera = null;
            resolve(false);
          }, PRAZO_CONEXAO_MS);
          acordarEspera = () => {
            const estado = pc?.connectionState;
            if (!encerrada && estado !== "connected" && estado !== "failed" && estado !== "closed") return;
            clearTimeout(prazo);
            acordarEspera = null;
            resolve(!encerrada && estado === "connected");
          };
          acordarEspera();
        });
        if (encerrada) return await cancelar();
        if (!conectou) {
          liberar();
          await avisarFim(true).catch(() => undefined);
          throw new ErroDeVoz("A voz natural não conseguiu conectar nesta rede.");
        }
        conectada = true;

        const pulsar = async () => {
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
        };
        // primeiro pulso já ao conectar: a espera pela conexão não pode encostar nos 30 s sem pulso
        // em que a varredura do servidor encerra a call
        void pulsar();
        pulso = setInterval(pulsar, 15_000);

        return { projectId: dados.projectId!, conversationId: dados.conversationId! };
      } catch (err) {
        // qualquer falha (microfone negado, rede, resposta sem JSON): nada fica ligado
        if (!(err instanceof ErroDeVoz)) {
          liberar();
          if (reservaEnviada) await avisarFim(true).catch(() => undefined);
        }
        // encerrada no meio do caminho (ex.: saiu da página): o erro é consequência do cancelamento
        if (encerrada && !(err instanceof ErroDeVoz && err.cancelada)) throw new ErroDeVoz("Chamada cancelada.", true);
        throw err;
      }
    },

    responder(delegacaoId, texto) {
      if (!encerrada) enviar({ type: EVENTOS.responderFalado, delegation_id: delegacaoId, text: texto });
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
