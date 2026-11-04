"use client";

import { criarDivisorDeFrases, formatBrlMicros } from "@forja/core";
import { ArrowLeft, Hand, Mic, MicOff, PhoneOff, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { concluirCall, prepararCall } from "@/app/(oficina)/actions";
import { EMPTY_SPEC, type CallSpec } from "@/lib/call";
import { Nucleo, type NucleoModo } from "./nucleo";
import { criarMotorNavegador, suporteDoNavegador, type MotorDeVoz } from "./voz";
import { criarChamadaNuvem, ErroDeVoz, type ChamadaNuvem } from "./voz-nuvem";

type Fase = "sala" | "conectando" | "ativa" | "encerrada";
interface Linha {
  id: string;
  quem: "voce" | "agente";
  texto: string;
}

class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const duracao = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function CallRoom(props: {
  nome: string;
  agente: string;
  projeto: { id: string; nome: string } | null;
  modelos: { id: string; nome: string }[];
  modeloPadrao: string;
  emailVerificado: boolean;
  vozNuvem: { disponivel: boolean; precoMinutoBrlMicros: number };
}) {
  const [fase, setFase] = useState<Fase>("sala");
  const [modo, setModo] = useState<NucleoModo>("repouso");
  const [legenda, setLegenda] = useState<{ quem: "voce" | "agente"; texto: string } | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [spec, setSpec] = useState<CallSpec>(EMPTY_SPEC);
  const [custo, setCusto] = useState(0);
  const [inicio, setInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(0);
  const [mudo, setMudo] = useState(false);
  const [modelo, setModelo] = useState(props.modeloPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizandoSpec, setAtualizandoSpec] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [suporte, setSuporte] = useState<ReturnType<typeof suporteDoNavegador> | null>(null);
  const [concluindo, iniciarConclusao] = useTransition();
  const [tipoVoz, setTipoVoz] = useState<"nuvem" | "navegador">(props.vozNuvem.disponivel ? "nuvem" : "navegador");

  const motor = useRef<MotorDeVoz | null>(null);
  const nuvem = useRef<ChamadaNuvem | null>(null);
  /** Chamada em nuvem ainda conectando (para cancelar se a pessoa sair da página). */
  const nuvemConectando = useRef<ChamadaNuvem | null>(null);
  /** false depois que a sala sai da tela: nada mais fala, cobra ou atualiza estado. */
  const montado = useRef(true);
  const delegacaoAbort = useRef<AbortController | null>(null);
  const projectId = useRef<string | null>(props.projeto?.id ?? null);
  const conversationId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /** true enquanto a resposta do agente ainda está chegando. */
  const recebendo = useRef(false);
  const specRef = useRef(spec);
  specRef.current = spec;
  const specEmVoo = useRef(false);
  const specPendente = useRef(false);
  const transcricaoCaixa = useRef<HTMLDivElement>(null);

  useEffect(() => setSuporte(suporteDoNavegador()), []);
  useEffect(() => {
    if (fase !== "ativa") return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fase]);
  useEffect(() => {
    // rola só a caixa da transcrição (scrollIntoView puxaria a página inteira no celular)
    const caixa = transcricaoCaixa.current;
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, [linhas]);
  useEffect(() => {
    montado.current = true;
    return () => {
      // saiu da sala (Voltar, botão voltar do navegador): corta resposta, fala e chamada
      montado.current = false;
      abort.current?.abort();
      delegacaoAbort.current?.abort();
      motor.current?.encerrar();
      void (nuvem.current ?? nuvemConectando.current)?.encerrar();
    };
  }, []);

  const nivel = () => {
    const fonte = nuvem.current ?? motor.current;
    return fonte ? Math.max(fonte.nivelUsuario(), fonte.nivelAgente()) : 0;
  };
  const nomeModelo = props.modelos.find((m) => m.id === modelo)?.nome ?? modelo;

  async function atualizarSpec() {
    if (!conversationId.current || !montado.current) return;
    if (specEmVoo.current) {
      specPendente.current = true;
      return;
    }
    specEmVoo.current = true;
    setAtualizandoSpec(true);
    try {
      const res = await fetch("/api/call/spec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId.current, spec: specRef.current }),
      });
      if (res.ok) {
        const data = (await res.json()) as { spec: CallSpec; chargeBrlMicros?: number };
        setSpec(data.spec);
        setCusto((c) => c + (data.chargeBrlMicros ?? 0));
      }
    } finally {
      specEmVoo.current = false;
      setAtualizandoSpec(false);
      if (specPendente.current) {
        specPendente.current = false;
        void atualizarSpec();
      }
    }
  }

  async function turno(texto: string) {
    const m = motor.current;
    const t = texto.trim();
    if (!m || !t) return;
    // interrupção: a pessoa falou por cima do agente
    abort.current?.abort();
    m.calar();
    setErro(null);
    const idAgente = crypto.randomUUID();
    setLinhas((l) => [...l, { id: crypto.randomUUID(), quem: "voce", texto: t }, { id: idAgente, quem: "agente", texto: "" }]);
    setLegenda({ quem: "voce", texto: t });
    setModo("pensando");

    const ctrl = new AbortController();
    abort.current = ctrl;
    recebendo.current = true;
    const divisor = criarDivisorDeFrases();
    let falou = false;
    try {
      // o projeto só é criado quando a conversa começa de verdade (sem projetos vazios)
      projectId.current ??= await prepararCall(props.projeto?.id ?? "nova");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.current,
          conversationId: conversationId.current,
          modelId: modelo,
          message: t,
          modo: "call",
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new ErroHttp(res.status, (await res.text()) || `Erro ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n");
        buffer = partes.pop() ?? "";
        for (const linha of partes) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha) as
            | { type: "conversation"; id: string }
            | { type: "text"; text: string }
            | { type: "done"; chargeBrlMicros: number; refused: boolean }
            | { type: "error"; message: string };
          if (ev.type === "conversation") conversationId.current = ev.id;
          else if (ev.type === "text") {
            setLinhas((l) => l.map((x) => (x.id === idAgente ? { ...x, texto: x.texto + ev.text } : x)));
            for (const frase of divisor.push(ev.text)) {
              falou = true;
              m.falar(frase);
            }
          } else if (ev.type === "done") {
            setCusto((c) => c + ev.chargeBrlMicros);
            for (const frase of divisor.flush()) {
              falou = true;
              m.falar(frase);
            }
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      recebendo.current = false;
      if (!montado.current) return;
      if (!falou || !m.falando()) setModo("ouvindo");
      void atualizarSpec();
    } catch (e) {
      if ((e as Error).name === "AbortError" || !montado.current) return;
      setLinhas((l) => l.filter((x) => x.id !== idAgente || x.texto));
      setModo("ouvindo");
      if (e instanceof ErroHttp && e.status === 402) {
        setErro("Seu saldo de créditos acabou. Faça uma recarga para continuar a call.");
        m.falar("Seu saldo de créditos acabou. Faça uma recarga para continuarmos.");
      } else {
        setErro((e as Error).message);
      }
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        recebendo.current = false;
      }
    }
  }

  /** Voz em nuvem: o modelo de voz pediu raciocínio; respondemos pelo nosso gateway. */
  async function delegar(id: string, pedido: string) {
    if (!pedido.trim() || !montado.current) return;
    setModo("pensando");
    // uma delegação nova substitui a anterior (a pessoa mudou de assunto no meio)
    delegacaoAbort.current?.abort();
    const ctrl = new AbortController();
    delegacaoAbort.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: projectId.current, conversationId: conversationId.current, modelId: modelo, message: pedido, modo: "call" }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new ErroHttp(res.status, (await res.text()) || `Erro ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resposta = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n");
        buffer = partes.pop() ?? "";
        for (const linha of partes) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha) as { type: string; text?: string; chargeBrlMicros?: number; message?: string };
          if (ev.type === "text" && ev.text) resposta += ev.text;
          else if (ev.type === "done") setCusto((c) => c + (ev.chargeBrlMicros ?? 0));
          else if (ev.type === "error") throw new Error(ev.message);
        }
      }
      if (ctrl.signal.aborted) return;
      nuvem.current?.responder(id, resposta || "Não consegui pensar numa resposta agora. Pode repetir?");
      void atualizarSpec();
    } catch (e) {
      if (ctrl.signal.aborted || !montado.current) return;
      const msg = e instanceof ErroHttp && e.status === 402 ? "Seu saldo de créditos acabou." : (e as Error).message;
      setErro(msg);
      nuvem.current?.responder(id, "Tive um problema para pensar nisso agora. Vamos tentar de novo em instantes.");
    } finally {
      if (delegacaoAbort.current === ctrl) {
        delegacaoAbort.current = null;
        if (montado.current) setModo("ouvindo");
      }
    }
  }

  async function entrarNaNuvem() {
    const c = criarChamadaNuvem({
      onLegenda: (quem, texto) => {
        setLegenda({ quem, texto });
        setModo(quem === "voce" ? "ouvindo" : "falando");
      },
      onFala: (quem, texto) => {
        setLinhas((l) => [...l, { id: crypto.randomUUID(), quem, texto }]);
        if (quem === "agente") setModo("ouvindo");
      },
      onDelegacao: (id, pedido) => void delegar(id, pedido),
      onEncerrada: (motivo) => {
        nuvem.current = null;
        delegacaoAbort.current?.abort();
        if (!montado.current) return;
        setFase("encerrada");
        setModo("repouso");
        setLegenda(null);
        if (motivo !== "Chamada encerrada.") setErro(motivo);
        void atualizarSpec();
      },
      onCobranca: (b) => setCusto((c) => c + b),
      onErro: (msg) => setErro(msg),
    });
    nuvemConectando.current = c;
    try {
      const r = await c.iniciar(props.projeto?.id ?? "nova");
      nuvemConectando.current = null;
      if (!montado.current) {
        void c.encerrar();
        return;
      }
      nuvem.current = c;
      projectId.current = r.projectId;
      conversationId.current = r.conversationId;
      setInicio(Date.now());
      setAgora(Date.now());
      setFase("ativa");
      setModo("ouvindo");
    } catch (e) {
      nuvemConectando.current = null;
      if (!montado.current || (e instanceof ErroDeVoz && e.cancelada)) return;
      const msg = e instanceof ErroDeVoz ? e.message : "Não foi possível acessar o microfone ou conectar a voz natural.";
      if (!(e instanceof ErroDeVoz)) console.error("[voz]", e);
      setErro(`${msg} Tente de novo ou escolha a voz do navegador.`);
      setFase("sala");
    }
  }

  async function entrar() {
    setErro(null);
    setFase("conectando");
    if (tipoVoz === "nuvem") return entrarNaNuvem();
    const m = criarMotorNavegador();
    motor.current = m;
    try {
      await m.iniciar({
      onParcial: (texto) => {
        if (m.falando()) return;
        setLegenda({ quem: "voce", texto });
        setModo((atual) => (atual === "pensando" ? atual : "ouvindo"));
      },
      onFinal: (texto) => void turno(texto),
      onFrase: (frase) => {
        setLegenda({ quem: "agente", texto: frase });
        setModo("falando");
      },
      // fila de fala vazia: volta a ouvir, a menos que a resposta ainda esteja chegando
      onFimDaFala: () => {
        if (!recebendo.current) setModo("ouvindo");
      },
      onErro: (msg) => setErro(msg),
      });
    } catch (e) {
      console.error("[voz]", e);
      m.encerrar();
      motor.current = null;
      if (!montado.current) return;
      setErro("Não foi possível iniciar a voz neste navegador. Tente o Chrome ou o Edge.");
      setFase("sala");
      return;
    }
    // saiu da sala enquanto o navegador pedia o microfone: não cumprimenta ninguém
    if (!montado.current || motor.current !== m) return;
    setInicio(Date.now());
    setAgora(Date.now());
    setFase("ativa");
    setModo("ouvindo");
    const saudacao = `Oi, ${props.nome}! Eu sou o ${props.agente}. Me conta: o que você quer construir?`;
    setLinhas([{ id: crypto.randomUUID(), quem: "agente", texto: saudacao }]);
    m.falar(saudacao);
  }

  function interromper() {
    abort.current?.abort();
    motor.current?.calar();
    setModo("ouvindo");
  }

  async function encerrar() {
    abort.current?.abort();
    if (nuvem.current) {
      await nuvem.current.encerrar();
      return;
    }
    motor.current?.encerrar();
    motor.current = null;
    setFase("encerrada");
    setModo("repouso");
    setLegenda(null);
    await atualizarSpec();
  }

  function alternarMudo() {
    const novo = !mudo;
    setMudo(novo);
    motor.current?.silenciarMicrofone(novo);
    nuvem.current?.silenciar(novo);
  }

  // ---------------------------------------------------------------- sala de espera
  if (fase === "sala" || fase === "conectando") {
    const bloqueado = !props.emailVerificado;
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <Nucleo tamanho={240} modo={fase === "conectando" ? "pensando" : "repouso"} rotulo={`${props.agente} aguardando`} />
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-aco-300">Sala de reunião</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold uppercase tracking-wide text-aco-100">Call com {props.agente}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-aco-300">
            Fale normalmente. {props.agente} pergunta, debate as ideias e monta a especificação do projeto enquanto vocês conversam.
          </p>
        </div>

        <dl className="grid w-full grid-cols-1 gap-px overflow-hidden rounded-xl border border-aco-800 bg-aco-800 text-left font-mono text-xs sm:grid-cols-3">
          <div className="bg-aco-900/90 p-3">
            <dt className="uppercase tracking-[0.14em] text-aco-400">Projeto</dt>
            <dd className="mt-1 truncate text-aco-100">{props.projeto?.nome ?? "Nova ideia"}</dd>
          </div>
          <div className="bg-aco-900/90 p-3">
            <dt className="uppercase tracking-[0.14em] text-aco-400">Cérebro</dt>
            <dd className="mt-1">
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                className="w-full bg-transparent text-aco-100 focus:outline-none"
                aria-label="Modelo usado na call"
              >
                {props.modelos.map((m) => (
                  <option key={m.id} value={m.id} className="bg-aco-900">
                    {m.nome}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          <div className="bg-aco-900/90 p-3">
            <dt className="uppercase tracking-[0.14em] text-aco-400">Voz</dt>
            <dd className="mt-1 text-aco-100">{tipoVoz === "nuvem" ? "natural · em nuvem" : "do navegador · sem custo"}</dd>
          </div>
        </dl>

        <fieldset className="grid w-full gap-2 text-left sm:grid-cols-2">
          <legend className="sr-only">Tipo de voz</legend>
          {(
            [
              {
                id: "nuvem",
                titulo: "Voz natural",
                texto: props.vozNuvem.disponivel
                  ? `Conversa fluida: ${props.agente} ouve enquanto fala e você pode interromper. ${formatBrlMicros(props.vozNuvem.precoMinutoBrlMicros)} por minuto + o modelo.`
                  : "Indisponível no momento (a plataforma ainda não ativou a voz em nuvem).",
                ok: props.vozNuvem.disponivel,
              },
              {
                id: "navegador",
                titulo: "Voz do navegador",
                texto: "Sem custo de voz (só o modelo). Funciona melhor no Chrome e no Edge; um fala de cada vez.",
                ok: true,
              },
            ] as const
          ).map((o) => (
            <label
              key={o.id}
              className={`cursor-pointer rounded-lg border p-3 text-sm transition ${tipoVoz === o.id ? "border-brasa bg-brasa/10" : "border-aco-700 bg-aco-900/60"} ${o.ok ? "" : "cursor-not-allowed opacity-50"}`}
            >
              <input
                type="radio"
                name="tipoVoz"
                value={o.id}
                checked={tipoVoz === o.id}
                disabled={!o.ok}
                onChange={() => setTipoVoz(o.id)}
                className="sr-only"
              />
              <span className="block font-semibold text-aco-100">{o.titulo}</span>
              <span className="mt-0.5 block text-xs text-aco-300">{o.texto}</span>
            </label>
          ))}
        </fieldset>

        {bloqueado ? (
          <p className="w-full rounded-md border border-brasa/40 bg-brasa/10 px-3 py-2 text-sm text-brasa-claro">
            Confirme seu e-mail para usar os modelos de IA (veja o aviso no painel).
          </p>
        ) : null}
        {tipoVoz === "navegador" && suporte && !suporte.reconhecimento ? (
          <p className="w-full rounded-md border border-palha/40 bg-palha/10 px-3 py-2 text-sm text-palha">
            Este navegador não reconhece fala. Você ainda pode entrar e digitar; para conversar por voz, use Chrome ou Edge.
          </p>
        ) : null}
        {erro ? <p className="text-sm text-brasa-claro">{erro}</p> : null}

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => void entrar()}
            disabled={fase === "conectando" || bloqueado}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brasa px-6 py-2.5 text-sm font-semibold text-aco-950 transition hover:bg-brasa-claro disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-palha"
          >
            <Mic size={16} /> {fase === "conectando" ? "Conectando…" : "Entrar na call"}
          </button>
          <Link
            href="/central"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-aco-700 px-6 py-2.5 text-sm text-aco-300 hover:text-aco-100"
          >
            <ArrowLeft size={15} /> Voltar
          </Link>
        </div>
        <p className="text-xs text-aco-400">O navegador vai pedir acesso ao microfone. O custo aparece em tempo real durante a call.</p>
      </main>
    );
  }

  const painelSpec = <PainelSpec spec={spec} atualizando={atualizandoSpec} />;

  // ---------------------------------------------------------------- encerrada
  if (fase === "encerrada") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-10">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-aco-300">
            Call encerrada · {duracao((agora || Date.now()) - (inicio ?? Date.now()))} · {formatBrlMicros(custo)}
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-wide text-aco-100">
            {spec.titulo || "Especificação da call"}
          </h1>
        </div>
        {erro ? (
          <p className="rounded-md border border-brasa/40 bg-brasa/10 px-3 py-2 text-center text-sm text-brasa-claro">
            {erro}
            {/saldo/i.test(erro) ? (
              <>
                {" "}
                <Link href="/plano" className="underline underline-offset-2 hover:text-aco-100">
                  Recarregar créditos
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {painelSpec}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            disabled={concluindo || atualizandoSpec || !projectId.current}
            onClick={() => iniciarConclusao(() => concluirCall({ projectId: projectId.current!, spec }))}
            className="rounded-md bg-brasa px-6 py-2.5 text-sm font-semibold text-aco-950 hover:bg-brasa-claro disabled:opacity-50"
          >
            {concluindo ? "Gerando…" : atualizandoSpec ? "Finalizando a especificação…" : "Gerar projeto com esta especificação"}
          </button>
          <Link href="/central" className="rounded-md border border-aco-700 px-6 py-2.5 text-center text-sm text-aco-300 hover:text-aco-100">
            Voltar à central
          </Link>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------- call ativa
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-aco-800/80 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-aco-300 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-brasa">
            <span className="h-2 w-2 rounded-full bg-brasa" style={{ animation: "cintilar 1.6s infinite" }} /> Ao vivo
          </span>
          <span className="tabular-nums text-aco-100">{duracao(agora - (inicio ?? agora))}</span>
          <span className="hidden sm:inline">· {props.agente} · {nomeModelo}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            custo <span className="text-palha tabular-nums">{formatBrlMicros(custo)}</span>
          </span>
          <button
            onClick={() => void encerrar()}
            className="inline-flex items-center gap-1.5 rounded-md bg-brasa/15 px-3 py-1.5 text-brasa hover:bg-brasa hover:text-aco-950"
          >
            <PhoneOff size={13} /> Encerrar
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,320px)]">
        <section className="order-3 min-h-0 lg:order-1" aria-label="Transcrição">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-aco-400">Transcrição</p>
          <div ref={transcricaoCaixa} className="max-h-[40vh] space-y-3 overflow-y-auto pr-1 text-sm lg:max-h-[calc(100dvh-12rem)]">
            {linhas
              .filter((l) => l.texto)
              .map((l) => (
                <p key={l.id} className={l.quem === "voce" ? "text-aco-100" : "text-aco-300"}>
                  <span className={`mr-1.5 font-mono text-[10px] uppercase ${l.quem === "voce" ? "text-revenido" : "text-brasa"}`}>
                    {l.quem === "voce" ? props.nome : props.agente}
                  </span>
                  {l.texto}
                </p>
              ))}
          </div>
        </section>

        <section className="order-1 flex flex-col items-center justify-center gap-6 lg:order-2">
          <Nucleo modo={modo} nivel={nivel} tamanho={320} rotulo={`${props.agente}: ${modo}`} />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-aco-400">
            {modo === "falando" ? `${props.agente} falando` : modo === "pensando" ? `${props.agente} pensando` : mudo ? "microfone desligado" : "ouvindo você"}
          </p>
          <p aria-live="polite" className="min-h-[4.5rem] max-w-2xl text-center text-xl leading-snug text-aco-100 sm:text-2xl">
            {legenda ? (
              <>
                <span className={`mr-2 font-mono text-xs uppercase ${legenda.quem === "voce" ? "text-revenido" : "text-brasa"}`}>
                  {legenda.quem === "voce" ? props.nome : props.agente}
                </span>
                {legenda.texto}
              </>
            ) : null}
          </p>
          {erro ? <p className="max-w-xl text-center text-sm text-brasa-claro">{erro}</p> : null}

          <div className="flex w-full max-w-xl flex-col items-center gap-3">
            <div className="flex gap-2">
              <button
                onClick={alternarMudo}
                aria-pressed={mudo}
                className="inline-flex items-center gap-2 rounded-full border border-aco-700 px-4 py-2 text-sm text-aco-100 hover:border-aco-500"
              >
                {mudo ? <MicOff size={15} /> : <Mic size={15} />} {mudo ? "Ligar microfone" : "Silenciar"}
              </button>
              <button
                onClick={interromper}
                style={tipoVoz === "nuvem" ? { display: "none" } : undefined}
                disabled={modo !== "falando" && modo !== "pensando"}
                className="inline-flex items-center gap-2 rounded-full border border-aco-700 px-4 py-2 text-sm text-aco-100 hover:border-aco-500 disabled:opacity-40"
              >
                <Hand size={15} /> Interromper
              </button>
            </div>
            <form
              style={tipoVoz === "nuvem" ? { display: "none" } : undefined}
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = digitado;
                setDigitado("");
                void turno(t);
              }}
            >
              <input
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder="Prefere digitar? Escreva aqui e aperte Enter"
                className="flex-1 rounded-md border border-aco-700 bg-aco-950/60 px-3 py-2 text-sm text-aco-100 placeholder:text-aco-400 focus:border-revenido focus:outline-none"
              />
              <button aria-label="Enviar" className="rounded-md border border-aco-700 px-3 text-aco-300 hover:text-aco-100">
                <SendHorizontal size={16} />
              </button>
            </form>
          </div>
        </section>

        <section className="order-2 min-h-0 lg:order-3">{painelSpec}</section>
      </div>
    </div>
  );
}

function PainelSpec({ spec, atualizando }: { spec: CallSpec; atualizando: boolean }) {
  const blocos: [string, string[]][] = [
    ["Funcionalidades", spec.funcionalidades],
    ["Telas", spec.telas],
    ["Dados", spec.dados],
    ["Integrações", spec.integracoes],
    ["Infraestrutura", spec.infraestrutura],
  ];
  const vazio = !spec.resumo && blocos.every(([, l]) => l.length === 0);
  return (
    <div className="rounded-xl border border-aco-800 bg-aco-850/70 p-4 backdrop-blur" aria-label="Especificação viva">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-aco-400">Especificação viva</p>
        {atualizando ? <span className="font-mono text-[10px] uppercase text-palha" style={{ animation: "cintilar 1s infinite" }}>atualizando</span> : null}
      </div>
      {vazio ? (
        <p className="text-sm text-aco-400">Ela se monta sozinha conforme vocês conversam: objetivo, funcionalidades, telas, dados e infraestrutura.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {spec.titulo ? <p className="font-display text-xl font-bold uppercase tracking-wide text-aco-100">{spec.titulo}</p> : null}
          {spec.resumo ? <p className="text-aco-100">{spec.resumo}</p> : null}
          {spec.publico ? (
            <p className="text-aco-300">
              <span className="font-mono text-[10px] uppercase text-aco-400">Para quem · </span>
              {spec.publico}
            </p>
          ) : null}
          {blocos.map(([rotulo, itens]) =>
            itens.length ? (
              <div key={rotulo}>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-aco-400">{rotulo}</p>
                <ul className="mt-1 space-y-0.5 text-aco-100">
                  {itens.map((i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brasa" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {spec.pendencias.length ? (
            <div className="rounded-md border border-palha/30 bg-palha/5 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-palha">Ainda em aberto</p>
              <ul className="mt-1 space-y-0.5 text-aco-100">
                {spec.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
