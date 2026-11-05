/**
 * Motores de voz da chamada.
 *
 * "navegador": reconhecimento e síntese de fala do próprio navegador (Web Speech API).
 * Grátis e sem chave de API — ideal para demonstração e para o teste grátis. O áudio
 * do reconhecimento é processado pelo serviço do navegador (no Chrome, servidores do
 * Google), então o motor em nuvem é o indicado para clientes com dados sensíveis.
 */

export interface EventosDeVoz {
  /** Texto parcial enquanto a pessoa fala (para a legenda). */
  onParcial(texto: string): void;
  /** A pessoa terminou de falar: texto final do turno. */
  onFinal(texto: string): void;
  /** O agente começou a falar esta frase (para a legenda). */
  onFrase(frase: string): void;
  /** A fila de fala do agente acabou. */
  onFimDaFala(): void;
  onErro(mensagem: string): void;
}

export interface MotorDeVoz {
  readonly tipo: "navegador" | "nuvem";
  iniciar(eventos: EventosDeVoz): Promise<void>;
  falar(frase: string): void;
  /** Para de falar imediatamente e esvazia a fila (interrupção). */
  calar(): void;
  silenciarMicrofone(mudo: boolean): void;
  falando(): boolean;
  nivelUsuario(): number;
  nivelAgente(): number;
  encerrar(): void;
}

// ---- tipos mínimos da Web Speech API (não estão em todos os lib.dom) ----
interface Alternativa {
  transcript: string;
}
interface Resultado {
  isFinal: boolean;
  0: Alternativa;
}
interface EventoReconhecimento {
  resultIndex: number;
  results: ArrayLike<Resultado>;
}
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoReconhecimento) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type ConstrutorReconhecedor = new () => Reconhecedor;

function construtorReconhecedor(): ConstrutorReconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorReconhecedor; webkitSpeechRecognition?: ConstrutorReconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function suporteDoNavegador() {
  return {
    reconhecimento: construtorReconhecedor() !== null,
    sintese: typeof window !== "undefined" && "speechSynthesis" in window,
    microfone: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
  };
}

/** Mede o volume do microfone (0..1) para o Núcleo reagir à voz. */
async function medidorDeMicrofone() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analisador);
  const buf = new Uint8Array(analisador.fftSize);
  let mudo = false;
  return {
    nivel() {
      if (mudo) return 0;
      analisador.getByteTimeDomainData(buf);
      let soma = 0;
      for (const v of buf) soma += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(soma / buf.length) * 5);
    },
    silenciar(m: boolean) {
      mudo = m;
      stream.getAudioTracks().forEach((t) => (t.enabled = !m));
    },
    fechar() {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

/** Síntese de fala, se existir (WebViews de apps como Instagram e Facebook não têm). */
const sintese = (): SpeechSynthesis | undefined => (typeof window !== "undefined" ? window.speechSynthesis : undefined);

/** Erros do reconhecimento que não se resolvem tentando de novo em seguida. */
const ERROS_PERSISTENTES = new Set(["network", "audio-capture", "language-not-supported"]);
const MAX_FALHAS_RECONHECIMENTO = 5;

/** Nomes de vozes masculinas em pt-BR (Microsoft no Edge/Windows, Apple no macOS/iOS). */
const MASCULINAS = /antonio|donato|fabio|humberto|julio|nicolau|valerio|felipe|daniel|ricardo/i;
/** Vozes neurais: soam como gente (no Edge: "Microsoft Antonio Online (Natural)"). */
const NATURAIS = /natural|neural|premium|enhanced|aprimorad/i;

export interface OpcaoDeVoz {
  nome: string;
  natural: boolean;
  masculina: boolean;
}

const vozesPtBr = () =>
  (sintese()?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("pt-br"));

/** Ordem de preferência para o Hefesto: masculina natural > masculina > natural > qualquer outra. */
function pontuar(v: SpeechSynthesisVoice) {
  return (MASCULINAS.test(v.name) ? 2 : 0) + (NATURAIS.test(v.name) ? 3 : 0) + (v.localService ? 0 : 0.5);
}

/** Vozes pt-BR disponíveis neste navegador, da mais indicada para a menos. */
export function listarVozes(): OpcaoDeVoz[] {
  return [...vozesPtBr()]
    .sort((a, b) => pontuar(b) - pontuar(a))
    .map((v) => ({ nome: v.name, natural: NATURAIS.test(v.name), masculina: MASCULINAS.test(v.name) }));
}

function escolherVoz(preferida?: string): SpeechSynthesisVoice | null {
  const vozes = vozesPtBr();
  if (preferida) {
    const v = vozes.find((x) => x.name === preferida);
    if (v) return v;
  }
  return [...vozes].sort((a, b) => pontuar(b) - pontuar(a))[0] ?? null;
}

/**
 * Timbre do Hefesto: um homem maduro, sem pressa. Numa voz masculina, só um pouco mais grave;
 * numa voz feminina (a única no Chrome), o tom não muda, para não soar artificial.
 */
function timbre(voz: SpeechSynthesisVoice | null) {
  const masculina = voz ? MASCULINAS.test(voz.name) : false;
  return { pitch: masculina ? 0.88 : 1, rate: 0.95 };
}

/** Fala uma frase de amostra (botão "ouvir" na sala de espera). */
export function ouvirAmostra(texto: string, preferida?: string) {
  const s = sintese();
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "pt-BR";
  const voz = escolherVoz(preferida);
  if (voz) u.voice = voz;
  Object.assign(u, timbre(voz));
  s.speak(u);
  return true;
}

export function criarMotorNavegador(opcoes: { voz?: string } = {}): MotorDeVoz {
  const Rec = construtorReconhecedor();
  let eventos: EventosDeVoz | null = null;
  let rec: Reconhecedor | null = null;
  let medidor: Awaited<ReturnType<typeof medidorDeMicrofone>> | null = null;
  let ativo = false;
  let mudo = false;
  let ouvindo = false;
  let fila: string[] = [];
  let falandoAgora = false;
  let nivelFala = 0;
  let textoFinal = "";
  let timerTurno: ReturnType<typeof setTimeout> | null = null;
  let avisouFalhaDeVoz = false;
  /** Falhas seguidas do reconhecimento (ex.: Brave responde "network" sempre). */
  let falhasReconhecimento = 0;
  let reconhecimentoDesistiu = false;

  const ouvir = () => {
    if (!rec || !ativo || mudo || falandoAgora || ouvindo || reconhecimentoDesistiu) return;
    try {
      rec.start();
      ouvindo = true;
    } catch {
      // já estava ouvindo
    }
  };
  const pararDeOuvir = () => {
    if (!rec || !ouvindo) return;
    ouvindo = false;
    try {
      rec.abort();
    } catch {
      // ignorar
    }
  };

  const fecharTurno = () => {
    const texto = textoFinal.trim();
    textoFinal = "";
    if (texto) eventos?.onFinal(texto);
  };

  const avisarFalhaDeVoz = () => {
    if (avisouFalhaDeVoz) return;
    avisouFalhaDeVoz = true;
    eventos?.onErro("O navegador não conseguiu reproduzir a voz do agente. As respostas continuam aparecendo na legenda.");
  };

  const falarProxima = () => {
    if (!ativo) {
      fila = [];
      falandoAgora = false;
      return;
    }
    const frase = fila.shift();
    if (!frase) {
      falandoAgora = false;
      eventos?.onFimDaFala();
      ouvir();
      return;
    }
    const s = sintese();
    if (!s) {
      // sem síntese de fala: a frase vai só para a legenda
      avisarFalhaDeVoz();
      eventos?.onFrase(frase);
      falarProxima();
      return;
    }
    falandoAgora = true;
    // sem cancelamento de eco no reconhecimento do navegador: não ouvir enquanto fala
    pararDeOuvir();
    const u = new SpeechSynthesisUtterance(frase);
    u.lang = "pt-BR";
    const voz = escolherVoz(opcoes.voz);
    if (voz) u.voice = voz;
    Object.assign(u, timbre(voz));
    u.onstart = () => eventos?.onFrase(frase);
    u.onboundary = () => {
      nivelFala = 0.85;
    };
    u.onend = () => falarProxima();
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") avisarFalhaDeVoz();
      falarProxima();
    };
    s.speak(u);
  };

  return {
    tipo: "navegador",

    async iniciar(ev) {
      eventos = ev;
      ativo = true;
      try {
        const m = await medidorDeMicrofone();
        // a call foi encerrada enquanto o navegador pedia permissão: não deixa o microfone ligado
        if (!ativo) {
          m.fechar();
          return;
        }
        medidor = m;
      } catch {
        if (!ativo) return;
        ev.onErro("Sem acesso ao microfone. Libere o microfone no navegador ou digite suas mensagens.");
      }
      // algumas vozes só aparecem depois desta chamada
      sintese()?.getVoices();
      if (!Rec) {
        ev.onErro("Este navegador não reconhece fala. Use Chrome ou Edge, ou digite suas mensagens.");
        return;
      }
      rec = new Rec();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        falhasReconhecimento = 0;
        let parcial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (r.isFinal) textoFinal += ` ${r[0].transcript}`;
          else parcial += r[0].transcript;
        }
        eventos?.onParcial(`${textoFinal} ${parcial}`.trim());
        if (timerTurno) clearTimeout(timerTurno);
        // 900 ms sem novas palavras = fim do turno
        timerTurno = setTimeout(fecharTurno, parcial ? 1400 : 900);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          ev.onErro("O navegador bloqueou o reconhecimento de voz. Libere o microfone ou digite suas mensagens.");
          reconhecimentoDesistiu = true;
        } else if (ERROS_PERSISTENTES.has(e.error) && ++falhasReconhecimento >= MAX_FALHAS_RECONHECIMENTO) {
          reconhecimentoDesistiu = true;
          ev.onErro("O reconhecimento de voz não está funcionando neste navegador. Digite suas mensagens ou use Chrome ou Edge.");
        }
      };
      rec.onend = () => {
        ouvindo = false;
        // o Chrome encerra o reconhecimento após silêncio: reinicia enquanto a call estiver ativa,
        // esperando mais a cada falha seguida (150 ms, 300 ms, 600 ms… até 5 s)
        if (ativo && !falandoAgora && !mudo && !reconhecimentoDesistiu) {
          setTimeout(ouvir, Math.min(5_000, 150 * 2 ** falhasReconhecimento));
        }
      };
      ouvir();
    },

    falar(frase) {
      if (!ativo || !frase.trim()) return;
      fila.push(frase);
      if (!falandoAgora) falarProxima();
    },

    calar() {
      fila = [];
      sintese()?.cancel();
      falandoAgora = false;
      ouvir();
    },

    silenciarMicrofone(m) {
      mudo = m;
      medidor?.silenciar(m);
      if (m) pararDeOuvir();
      else ouvir();
    },

    falando: () => falandoAgora,

    nivelUsuario: () => (ouvindo ? (medidor?.nivel() ?? 0) : 0),

    nivelAgente() {
      nivelFala *= 0.9;
      return falandoAgora ? Math.max(0.25, nivelFala) : 0;
    },

    encerrar() {
      ativo = false;
      fila = [];
      if (timerTurno) clearTimeout(timerTurno);
      sintese()?.cancel();
      pararDeOuvir();
      medidor?.fechar();
      medidor = null;
    },
  };
}
