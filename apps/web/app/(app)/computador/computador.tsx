"use client";

import type { AnaliseDaPasta, ArquivoPlanejado, FerramentaDeTelemetria, FerramentaDoTime, ForjaDesktop, PastaLocal, SituacaoDaAtualizacao, SituacaoDaTelemetria } from "@forja/agent";
import { Badge, Button, buttonClass, Card, CardHeader, EmptyState, Notice } from "@forja/ui";
import { FolderOpen, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "@/lib/desktop";
import { criarFonteDoDesktopAction, descartarFonteAction } from "./actions";

const TELEMETRIA: Record<FerramentaDeTelemetria, string> = { claude_code: "Claude Code", codex: "Codex", gemini_cli: "Gemini CLI" };
const DO_TIME: [FerramentaDoTime, string][] = [
  ["claude_code", "Claude Code"],
  ["codex", "Codex"],
  ["gemini_cli", "Gemini CLI"],
  ["grok_build", "Grok Build"],
];
const SISTEMA = { mac: "macOS", windows: "Windows", linux: "Linux" };
const SEVERIDADE = {
  critica: { label: "crítica", tone: "red" as const },
  alta: { label: "alta", tone: "red" as const },
  media: { label: "média", tone: "amber" as const },
  baixa: { label: "baixa", tone: "gray" as const },
  info: { label: "info", tone: "gray" as const },
};
const ATUALIZACAO: Record<SituacaoDaAtualizacao["estado"], string> = {
  desligada: "atualização automática desligada nesta versão",
  em_dia: "em dia",
  verificando: "procurando atualização…",
  baixando: "baixando a versão nova…",
  pronta: "versão nova pronta",
  erro: "não consegui verificar atualização",
};
type Info = Awaited<ReturnType<ForjaDesktop["info"]>>;

export function Computador() {
  const [app, setApp] = useState<ForjaDesktop | null | undefined>(undefined);
  const [info, setInfo] = useState<Info | null>(null);
  const [atualizacao, setAtualizacao] = useState<SituacaoDaAtualizacao | null>(null);

  useEffect(() => {
    const d = window.forjaDesktop ?? null;
    setApp(d);
    if (!d) return;
    void d.info().then(setInfo);
    void d.atualizacao.situacao().then(setAtualizacao);
  }, []);

  if (app === undefined) return null;
  if (!app) {
    return (
      <EmptyState
        title="Isto funciona no app da Forja para computador"
        description="Pelo navegador, a Forja não lê pastas nem altera arquivos da sua máquina. Instale o app (macOS ou Windows) e abra esta mesma tela por lá."
        action={
          <Link href="/baixar" className={buttonClass("brand")}>
            Baixar o app
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      {info ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600" data-testid="info-do-app">
          <span>
            <b className="text-zinc-900">{info.computador}</b> · {SISTEMA[info.sistema]} ({info.processador}) · app {info.versao}
          </span>
          {atualizacao ? (
            <>
              <Badge tone={atualizacao.estado === "pronta" ? "green" : atualizacao.estado === "erro" ? "amber" : "gray"}>{ATUALIZACAO[atualizacao.estado]}</Badge>
              {atualizacao.estado === "pronta" ? (
                <Button size="sm" onClick={() => void app.atualizacao.instalar()}>
                  Reiniciar e atualizar
                </Button>
              ) : atualizacao.estado !== "desligada" && atualizacao.estado !== "baixando" ? (
                <button type="button" className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline" onClick={() => void app.atualizacao.verificar().then(setAtualizacao)}>
                  Procurar agora
                </button>
              ) : null}
            </>
          ) : null}
        </p>
      ) : null}
      <Telemetria app={app} computador={info?.computador ?? ""} />
      <Pastas app={app} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telemetria das ferramentas
// ---------------------------------------------------------------------------

function Telemetria({ app, computador }: { app: ForjaDesktop; computador: string }) {
  const [lista, setLista] = useState<SituacaoDaTelemetria[] | null>(null);
  const [ocupada, setOcupada] = useState<FerramentaDeTelemetria | null>(null);
  const [aviso, setAviso] = useState<{ tom: "blue" | "red"; texto: string } | null>(null);
  const recarregar = useCallback(() => app.telemetria.situacao().then(setLista), [app]);
  useEffect(() => void recarregar(), [recarregar]);

  async function ligar(f: FerramentaDeTelemetria) {
    setOcupada(f);
    setAviso(null);
    try {
      const fonte = await criarFonteDoDesktopAction(f, `${TELEMETRIA[f]} · ${computador || "computador"}`.slice(0, 80));
      if (!fonte.token || !fonte.id) return setAviso({ tom: "red", texto: fonte.erro ?? "Não consegui criar a fonte." });
      const r = await app.telemetria.aplicar(f, fonte.token);
      if (!r.ok) {
        await descartarFonteAction(fonte.id);
        return setAviso(r.cancelado ? null : { tom: "red", texto: r.erro ?? "Não consegui gravar a configuração." });
      }
      setAviso({
        tom: "blue",
        texto: `${TELEMETRIA[f]} configurado. Feche e abra a ferramenta para valer.${r.copiaDeSeguranca ? ` O arquivo anterior ficou em ${r.copiaDeSeguranca}.` : ""}`,
      });
      await recarregar();
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Telemetria com um clique"
        description="Liga o envio de uso das ferramentas instaladas neste computador. Vão só os números de cada pedido (modelo, tokens, custo, duração). Prompts, respostas e código não saem daqui."
        actions={
          <Link href="/assistentes" className={buttonClass("secondary", "sm")}>
            Ver o uso
          </Link>
        }
      />
      <ul className="divide-y divide-zinc-100" data-testid="telemetria">
        {(lista ?? []).map((t) => (
          <li key={t.ferramenta} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-medium text-zinc-900">{TELEMETRIA[t.ferramenta]}</p>
              <p className="truncate font-mono text-xs text-zinc-500">{t.arquivo}</p>
            </div>
            <div className="flex items-center gap-3">
              {t.ilegivel ? (
                <Badge tone="amber">arquivo ilegível</Badge>
              ) : t.situacao === "forja" ? (
                <Badge tone="green">enviando para a Forja</Badge>
              ) : t.situacao === "outro" ? (
                <Badge tone="amber">envia para outro endereço</Badge>
              ) : (
                <Badge tone="gray">desligada</Badge>
              )}
              <Button size="sm" variant={t.situacao === "forja" ? "secondary" : "primary"} disabled={ocupada !== null || t.ilegivel} onClick={() => void ligar(t.ferramenta)}>
                {ocupada === t.ferramenta ? "Aguardando a confirmação…" : t.situacao === "forja" ? "Trocar o token" : "Ligar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {aviso ? (
        <div className="px-5 pb-4">
          <Notice tone={aviso.tom}>{aviso.texto}</Notice>
        </div>
      ) : null}
      <p className="px-5 pb-4 text-xs text-zinc-500">
        Antes de gravar, o app mostra o que muda e pede a sua confirmação. "Envia para outro endereço" quer dizer que a ferramenta já tem telemetria apontando para outro
        lugar: ligar aqui troca o destino. Grok Build se configura por variável de ambiente, em Minhas IAs.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pastas de projeto
// ---------------------------------------------------------------------------

function Pastas({ app }: { app: ForjaDesktop }) {
  const [recentes, setRecentes] = useState<PastaLocal[]>([]);
  const [analise, setAnalise] = useState<AnaliseDaPasta | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => void app.pastas.recentes().then(setRecentes), [app]);

  async function abrir(id?: string) {
    setLendo(true);
    setErro(null);
    try {
      const r = id ? await app.pastas.analisar(id) : await app.pastas.escolher();
      if (r && "erro" in r) setErro(r.erro);
      else if (r) setAnalise(r);
      setRecentes(await app.pastas.recentes());
    } catch {
      setErro("Não consegui ler a pasta.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Pasta de projeto"
        description="Abra uma pasta deste computador para ver a estrutura e a varredura de segurança, sem GitHub e sem enviar os arquivos para fora."
        actions={
          <Button size="sm" disabled={lendo} onClick={() => void abrir()}>
            <FolderOpen size={14} /> {lendo ? "Lendo…" : "Abrir pasta"}
          </Button>
        }
      />
      {erro ? (
        <div className="px-5 pb-4">
          <Notice tone="red">{erro}</Notice>
        </div>
      ) : null}
      {recentes.length && !analise ? (
        <ul className="divide-y divide-zinc-100" data-testid="recentes">
          {recentes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">{p.nome}</p>
                <p className="truncate font-mono text-xs text-zinc-500">{p.caminho}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={lendo} onClick={() => void abrir(p.id)}>
                Abrir
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {analise ? <Analise app={app} analise={analise} reler={() => void abrir(analise.id)} lendo={lendo} fechar={() => setAnalise(null)} /> : null}
    </Card>
  );
}

function Analise({ app, analise, reler, lendo, fechar }: { app: ForjaDesktop; analise: AnaliseDaPasta; reler: () => void; lendo: boolean; fechar: () => void }) {
  const e = analise.estrutura;
  const totalBytes = Math.max(1, e.linguagens.reduce((s, l) => s + l.bytes, 0));
  return (
    <div className="space-y-5 border-t border-zinc-100 px-5 py-4" data-testid="analise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-zinc-900">{analise.nome}</p>
          <p className="truncate font-mono text-xs text-zinc-500">
            {analise.caminho} · {analise.versionada ? `branch ${e.branch}` : "sem git"} · {e.arquivos.toLocaleString("pt-BR")} arquivos
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={lendo} onClick={reler}>
            <RefreshCw size={14} /> Ler de novo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void app.pastas.mostrar(analise.id)}>
            Mostrar a pasta
          </Button>
          <Button size="sm" variant="secondary" onClick={fechar}>
            Fechar
          </Button>
        </div>
      </div>
      {analise.truncada ? <Notice>A pasta é grande demais: li só uma parte (até 30 mil arquivos ou 200 MB).</Notice> : null}
      {!analise.versionada ? (
        <Notice tone="blue">Esta pasta não é um repositório git: li todos os arquivos, menos dependências e saídas de build.</Notice>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Stack e linguagens</h3>
          <div className="flex flex-wrap gap-1.5">
            {e.stack.length ? e.stack.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-sm text-zinc-500">Nenhuma stack reconhecida.</span>}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700">
            {e.linguagens.slice(0, 6).map((l) => (
              <li key={l.nome} className="flex justify-between gap-3">
                <span>{l.nome}</span>
                <span className="tabular-nums text-zinc-500">
                  {l.arquivos} arquivos · {Math.round((l.bytes / totalBytes) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Instruções de IA no projeto</h3>
          {e.configsDeIa.length ? (
            <ul className="space-y-1 text-sm text-zinc-700">
              {e.configsDeIa.slice(0, 8).map((c) => (
                <li key={c.caminho} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-xs">{c.caminho}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">~{c.tokensAprox.toLocaleString("pt-BR")} tokens</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Nenhum CLAUDE.md, AGENTS.md ou GEMINI.md ainda. Instalar o time cria o que falta.</p>
          )}
          {e.avisos.map((a) => (
            <p key={a} className="mt-2 text-xs text-amber-700">
              {a}
            </p>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Varredura ({analise.achados.length})</h3>
        {analise.achados.length ? (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200" data-testid="achados">
            {analise.achados.slice(0, 30).map((a, i) => (
              <li key={`${a.titulo}-${a.arquivo}-${i}`} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERIDADE[a.severidade].tone}>{SEVERIDADE[a.severidade].label}</Badge>
                  <span className="font-medium text-zinc-900">{a.titulo}</span>
                  {a.arquivo ? (
                    <span className="font-mono text-xs text-zinc-500">
                      {a.arquivo}
                      {a.linha ? `:${a.linha}` : ""}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-zinc-600">{a.detalhe}</p>
                <p className="mt-1 text-zinc-800">{a.recomendacao}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">Nenhum segredo exposto nem arquivo de ambiente versionado.</p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          A varredura roda neste computador e não usa créditos. A auditoria completa com o time (Dev Sênior, QA e Segurança) funciona com o repositório no GitHub, em Projetos →
          Repositório, ou com o seu assistente depois de instalar o time abaixo.
        </p>
      </div>

      <Time app={app} id={analise.id} depois={reler} />
    </div>
  );
}

function Time({ app, id, depois }: { app: ForjaDesktop; id: string; depois: () => void }) {
  const [escolha, setEscolha] = useState<FerramentaDoTime[]>(["claude_code"]);
  const [plano, setPlano] = useState<ArquivoPlanejado[] | null>(null);
  const [aviso, setAviso] = useState<{ tom: "blue" | "red"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setPlano(null);
    if (!escolha.length) return;
    void app.time.previa(id, escolha).then((r) => {
      if (vivo && Array.isArray(r)) setPlano(r);
    });
    return () => {
      vivo = false;
    };
  }, [app, id, escolha]);

  const mudam = (plano ?? []).filter((p) => p.estado !== "igual");

  async function instalar() {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await app.time.instalar(id, escolha);
      if (!r.ok) return setAviso(r.cancelado ? null : { tom: "red", texto: r.erro ?? "Não consegui gravar." });
      setAviso({ tom: "blue", texto: r.arquivos?.length ? `${r.arquivos.length} arquivo(s) gravado(s). Revise com git diff e faça o commit quando quiser.` : "O time já estava instalado e em dia." });
      setPlano(await app.time.previa(id, escolha).then((p) => (Array.isArray(p) ? p : null)));
      depois();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div data-testid="time">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Instalar o time de especialistas nesta pasta</h3>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-800">
        {DO_TIME.map(([f, nome]) => (
          <label key={f} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={escolha.includes(f)}
              onChange={(ev) => setEscolha((atual) => (ev.target.checked ? [...atual, f] : atual.filter((x) => x !== f)))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {nome}
          </label>
        ))}
      </div>
      {plano ? (
        <ul className="mt-3 max-h-56 overflow-auto rounded-lg border border-zinc-200 text-sm" data-testid="plano">
          {plano.map((p) => (
            <li key={p.caminho} className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate font-mono text-xs text-zinc-800">{p.caminho}</span>
              <Badge tone={p.estado === "novo" ? "green" : p.estado === "muda" ? "amber" : "gray"}>{p.estado === "novo" ? "novo" : p.estado === "muda" ? "altera" : "em dia"}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={ocupado || !escolha.length || (plano !== null && !mudam.length)} onClick={() => void instalar()}>
          {ocupado ? "Aguardando a confirmação…" : plano && !mudam.length ? "Time em dia" : `Instalar${mudam.length ? ` (${mudam.length} arquivo${mudam.length > 1 ? "s" : ""})` : ""}`}
        </Button>
        <Link href="/assistentes/time" className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
          O que cada papel faz
        </Link>
      </div>
      {aviso ? (
        <div className="mt-3">
          <Notice tone={aviso.tom}>{aviso.texto}</Notice>
        </div>
      ) : null}
    </div>
  );
}
