"use client";

import { formatBrlMicros } from "@forja/core";
import { Badge, Button, Card, CardHeader, cx, Notice } from "@forja/ui";
import { Check, ExternalLink, FileText, FolderTree, Pencil, Search, Square, Trash2, TriangleAlert, Brain } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { STATUS_DA_TAREFA } from "@/lib/agente-ui";
import { aprovarTarefaAction, descartarTarefaAction, pararTarefaAction } from "../actions";

interface Passo {
  idx: number;
  kind: string;
  toolName: string | null;
  summary: string;
  detail: string | null;
  isError: boolean;
}
interface Tarefa {
  id: string;
  status: string;
  titulo: string;
  repo: string;
  branchBase: string;
  plano: string | null;
  resumo: string | null;
  tituloPr: string | null;
  motivo: string | null;
  erro: string | null;
  prUrl: string | null;
  gastoBrlMicros: number;
  tetoBrlMicros: number;
  passos: number;
  arquivosAlterados: number;
  parando: boolean;
}
interface ArquivoDoDiff {
  path: string;
  tipo: "novo" | "apagado" | "alterado";
  adicionadas: number;
  removidas: number;
  patch: string;
}

const EM_ANDAMENTO = new Set(["executando", "abrindo_pr"]);
const COM_DIFF = new Set(["aguardando_aprovacao", "abrindo_pr", "concluida", "parada"]);

function iconeDoPasso(p: Passo) {
  if (p.isError || p.kind === "aviso") return <TriangleAlert size={14} className="text-amber-600" />;
  if (p.kind === "pensamento") return <Brain size={14} className="text-zinc-400" />;
  switch (p.toolName) {
    case "listar_arquivos":
      return <FolderTree size={14} className="text-zinc-500" />;
    case "ler_arquivo":
      return <FileText size={14} className="text-zinc-500" />;
    case "buscar":
      return <Search size={14} className="text-zinc-500" />;
    case "apagar_arquivo":
      return <Trash2 size={14} className="text-red-600" />;
    case "concluir":
      return <Check size={14} className="text-green-600" />;
    default:
      return <Pencil size={14} className="text-brand-600" />;
  }
}

export function TarefaAoVivo({ inicial }: { inicial: { tarefa: Tarefa; passos: Passo[] } }) {
  const router = useRouter();
  const [tarefa, setTarefa] = useState(inicial.tarefa);
  const [passos, setPassos] = useState(inicial.passos);
  const [diff, setDiff] = useState<ArquivoDoDiff[] | null>(null);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const ultimo = useRef(inicial.passos.at(-1)?.idx ?? -1);
  const fimDaLista = useRef<HTMLDivElement>(null);

  const atualizar = useCallback(
    async (comDiff = false) => {
      const r = await fetch(`/api/agente/tarefas/${tarefa.id}?desde=${ultimo.current}${comDiff ? "&diff=1" : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { tarefa: Tarefa; passos: Passo[]; diff: ArquivoDoDiff[] | null };
      setTarefa(j.tarefa);
      if (j.passos.length) {
        ultimo.current = j.passos.at(-1)!.idx;
        setPassos((p) => [...p, ...j.passos.filter((x) => !p.some((y) => y.idx === x.idx))]);
      }
      if (j.diff) setDiff(j.diff);
    },
    [tarefa.id],
  );

  // enquanto trabalha: consulta a cada 1,5 s (e a consulta retoma a execução se ela parou no meio)
  useEffect(() => {
    if (!EM_ANDAMENTO.has(tarefa.status)) return;
    const t = setInterval(() => void atualizar(), 1500);
    return () => clearInterval(t);
  }, [tarefa.status, atualizar]);

  // terminou: busca o diff uma vez
  useEffect(() => {
    if (COM_DIFF.has(tarefa.status) && tarefa.arquivosAlterados > 0 && diff === null) void atualizar(true);
  }, [tarefa.status, tarefa.arquivosAlterados, diff, atualizar]);

  useEffect(() => {
    if (EM_ANDAMENTO.has(tarefa.status)) fimDaLista.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [passos.length, tarefa.status]);

  const st = STATUS_DA_TAREFA[tarefa.status] ?? { label: tarefa.status, tone: "gray" as const };
  const proporcao = tarefa.tetoBrlMicros ? Math.min(100, (tarefa.gastoBrlMicros / tarefa.tetoBrlMicros) * 100) : 0;
  const passosVisiveis = passos.filter((p) => !(p.kind === "pensamento" && p.summary === "…"));

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{tarefa.parando && tarefa.status === "executando" ? "Parando…" : st.label}</Badge>
          <span className="text-xs text-zinc-500">
            {tarefa.repo} · base {tarefa.branchBase} · {tarefa.passos} passo(s)
          </span>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-zinc-600">Custo da tarefa</span>
            <span className="tabular-nums">
              <b>{formatBrlMicros(tarefa.gastoBrlMicros)}</b> <span className="text-zinc-500">de {formatBrlMicros(tarefa.tetoBrlMicros)}</span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className={cx("h-full rounded-full", proporcao > 85 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${proporcao}%` }} />
          </div>
        </div>
        {tarefa.motivo && !EM_ANDAMENTO.has(tarefa.status) && tarefa.status !== "concluida" ? (
          <p className="mt-3 text-sm text-zinc-600">{tarefa.motivo}</p>
        ) : null}
        {tarefa.erro ? (
          <div className="mt-3">
            <Notice tone="red">{tarefa.erro}</Notice>
          </div>
        ) : null}
        {erro ? (
          <div className="mt-3">
            <Notice tone="red">{erro}</Notice>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {tarefa.status === "executando" && !tarefa.parando ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={ocupado}
              onClick={() =>
                iniciar(async () => {
                  await pararTarefaAction(tarefa.id);
                  await atualizar();
                })
              }
            >
              <Square size={13} /> Parar
            </Button>
          ) : null}
          {tarefa.status === "aguardando_aprovacao" ? (
            <>
              <Button
                variant="brand"
                disabled={ocupado}
                onClick={() =>
                  iniciar(async () => {
                    setErro(null);
                    const r = await aprovarTarefaAction(tarefa.id);
                    if (r.erro) setErro(r.erro);
                    await atualizar(true);
                    // mostra o cartão de entrega (preview e migrações)
                    if (r.url) router.refresh();
                  })
                }
              >
                {ocupado ? "Abrindo o PR…" : "Aprovar e abrir o PR"}
              </Button>
              <Button
                variant="ghost"
                disabled={ocupado}
                onClick={() =>
                  iniciar(async () => {
                    if (!window.confirm("Descartar as mudanças desta tarefa? Nada vai para o GitHub.")) return;
                    await descartarTarefaAction(tarefa.id);
                    await atualizar();
                  })
                }
              >
                Descartar
              </Button>
            </>
          ) : null}
          {tarefa.prUrl ? (
            <a href={tarefa.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Ver o pull request <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </Card>

      {tarefa.plano ? (
        <Card>
          <CardHeader title="Plano" />
          <p className="whitespace-pre-wrap px-5 pb-5 text-sm text-zinc-700">{tarefa.plano}</p>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Passos" description={EM_ANDAMENTO.has(tarefa.status) ? "Ao vivo. Você pode sair desta página: ela continua quando você voltar." : undefined} />
        {passosVisiveis.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">{EM_ANDAMENTO.has(tarefa.status) ? "Baixando o repositório e preparando o plano…" : "Nenhum passo registrado."}</p>
        ) : (
          <ol className="divide-y divide-zinc-100">
            {passosVisiveis.map((p) => (
              <li key={p.idx} className="flex gap-3 px-5 py-2.5 text-sm">
                <span className="mt-0.5 shrink-0">{iconeDoPasso(p)}</span>
                <span className={cx("min-w-0 break-words", p.kind === "pensamento" ? "text-zinc-500" : "text-zinc-800", p.isError && "text-amber-800")}>
                  {p.summary}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div ref={fimDaLista} />
      </Card>

      {tarefa.resumo ? (
        <Card>
          <CardHeader title={tarefa.tituloPr ?? "Resumo"} description="Vai na descrição do pull request." />
          <p className="whitespace-pre-wrap px-5 pb-5 text-sm text-zinc-700">{tarefa.resumo}</p>
        </Card>
      ) : null}

      {diff && diff.length ? (
        <Card>
          <CardHeader
            title={`Mudanças (${diff.length} arquivo${diff.length > 1 ? "s" : ""})`}
            description={tarefa.prUrl ? "O que foi para o pull request." : "Revise antes de aprovar. Nada foi escrito no GitHub ainda."}
          />
          <ul className="divide-y divide-zinc-100">
            {diff.map((a) => (
              <li key={a.path}>
                <button
                  className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm hover:bg-zinc-50"
                  onClick={() => setAberto((x) => ({ ...x, [a.path]: !x[a.path] }))}
                >
                  <span className="min-w-0 truncate font-mono text-xs text-zinc-800">{a.path}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    {a.tipo === "novo" ? <Badge tone="green">novo</Badge> : a.tipo === "apagado" ? <Badge tone="red">apagado</Badge> : null}
                    <span className="text-green-700">+{a.adicionadas}</span>
                    <span className="text-red-700">−{a.removidas}</span>
                  </span>
                </button>
                {aberto[a.path] ? (
                  <pre className="max-h-[32rem] overflow-auto border-t border-zinc-100 bg-zinc-950 px-4 py-3 text-xs leading-5">
                    {a.patch.split("\n").map((l, i) => (
                      <div
                        key={i}
                        className={cx(
                          "whitespace-pre",
                          l.startsWith("+") ? "text-green-300" : l.startsWith("-") ? "text-red-300" : l.startsWith("@@") ? "text-sky-300" : "text-zinc-400",
                        )}
                      >
                        {l || " "}
                      </div>
                    ))}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
