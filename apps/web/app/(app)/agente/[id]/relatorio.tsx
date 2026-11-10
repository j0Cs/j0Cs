"use client";

import { Badge, Button, Card, CardHeader, cx, Notice } from "@forja/ui";
import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { comentarNoPRAction, corrigirAchadosAction } from "../actions";

type Categoria = "seguranca" | "estrutura" | "qualidade" | "desempenho" | "economia";
type Severidade = "critica" | "alta" | "media" | "baixa" | "info";
interface Achado {
  categoria: Categoria;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  arquivo?: string | null;
  linha?: number | null;
  recomendacao: string;
  origem: "varredura" | "agente";
  persona?: Persona | null;
}
type Persona = "dev_senior" | "dev_pleno" | "qa_pleno" | "seguranca_pleno";
type Veredito = "pode_seguir" | "seguir_com_ajustes" | "nao_seguir";
export interface Relatorio {
  varredura?: Achado[];
  achados?: Achado[];
  notas?: Partial<Record<Categoria, number>>;
  personas?: Persona[];
  pareceres?: { persona: Persona; parecer: string }[];
  pr?: { numero: number; url: string; titulo: string; autor: string | null; base: string; head: string };
  veredito?: Veredito | null;
  comentario?: { url: string; em: string } | null;
}

const PERSONA: Record<Persona, string> = { dev_senior: "Dédalo, o arquiteto", dev_pleno: "Brontes, o forjador", qa_pleno: "Argos, o inspetor", seguranca_pleno: "Cérbero, o guardião" };
const VEREDITO: Record<Veredito, { label: string; tone: "green" | "amber" | "red" }> = {
  pode_seguir: { label: "Pode seguir", tone: "green" },
  seguir_com_ajustes: { label: "Seguir com ajustes", tone: "amber" },
  nao_seguir: { label: "Não seguir", tone: "red" },
};

const CATEGORIAS: Record<Categoria, string> = {
  seguranca: "Segurança",
  estrutura: "Estrutura",
  qualidade: "Qualidade",
  desempenho: "Desempenho",
  economia: "Economia de tokens",
};
const SEVERIDADE: Record<Severidade, { label: string; tone: "red" | "amber" | "gray" | "blue"; ordem: number }> = {
  critica: { label: "crítica", tone: "red", ordem: 0 },
  alta: { label: "alta", tone: "red", ordem: 1 },
  media: { label: "média", tone: "amber", ordem: 2 },
  baixa: { label: "baixa", tone: "gray", ordem: 3 },
  info: { label: "info", tone: "blue", ordem: 4 },
};

export function RelatorioDaAuditoria(props: { taskId: string; tipo: "auditoria" | "revisao"; repo: string; sha: string | null; relatorio: Relatorio; emAndamento: boolean }) {
  const revisao = props.tipo === "revisao";
  const [filtro, setFiltro] = useState<Categoria | "todas">("todas");
  const [publicado, setPublicado] = useState<string | null>(props.relatorio.comentario?.url ?? null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const todos = [
    ...(props.relatorio.varredura ?? []).map((a, i) => ({ ...a, chave: `varredura:${i}` })),
    ...(props.relatorio.achados ?? []).map((a, i) => ({ ...a, chave: `agente:${i}` })),
  ].sort((a, b) => SEVERIDADE[a.severidade].ordem - SEVERIDADE[b.severidade].ordem);
  const visiveis = filtro === "todas" ? todos : todos.filter((a) => a.categoria === filtro);
  const porCategoria = (c: Categoria) => todos.filter((a) => a.categoria === c).length;
  const notas = props.relatorio.notas ?? {};
  const link = (a: Achado) =>
    a.arquivo && props.sha ? `https://github.com/${props.repo}/blob/${props.sha}/${a.arquivo}${a.linha ? `#L${a.linha}` : ""}` : null;

  const alternar = (chave: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(chave)) n.delete(chave);
      else if (n.size < 15) n.add(chave);
      return n;
    });

  const pr = props.relatorio.pr;
  const veredito = props.relatorio.veredito ? VEREDITO[props.relatorio.veredito] : null;
  return (
    <Card>
      <CardHeader
        title={`${revisao ? "Revisão" : "Relatório"} (${todos.length} achado${todos.length === 1 ? "" : "s"})`}
        description={
          props.emAndamento
            ? "Os achados aparecem aqui conforme o time analisa."
            : revisao
              ? "Publique a revisão no pull request para quem escreveu o código (pessoa ou assistente de IA) corrigir."
              : "Marque o que quer corrigir (até 15) e mande o agente fazer: ele abre uma tarefa com o diff para você aprovar."
        }
        actions={veredito ? <Badge tone={veredito.tone}>{veredito.label}</Badge> : undefined}
      />
      <div className="space-y-4 p-5">
        {pr ? (
          <p className="text-sm text-zinc-700">
            <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
              PR #{pr.numero}: {pr.titulo} <ExternalLink size={12} />
            </a>{" "}
            <span className="text-xs text-zinc-500">
              {pr.head} → {pr.base}
              {pr.autor ? ` · por ${pr.autor}` : ""}
            </span>
          </p>
        ) : null}

        {props.relatorio.pareceres?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {props.relatorio.pareceres.map((p) => (
              <div key={p.persona} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Parecer de {PERSONA[p.persona]}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{p.parecer}</p>
              </div>
            ))}
          </div>
        ) : props.relatorio.personas?.length && props.emAndamento ? (
          <p className="text-xs text-zinc-500">Time: {props.relatorio.personas.map((p) => PERSONA[p]).join(", ")}.</p>
        ) : null}
        {Object.keys(notas).length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(CATEGORIAS) as Categoria[]).map((c) =>
              notas[c] !== undefined ? (
                <div key={c} className="rounded-lg border border-zinc-200 px-3 py-2">
                  <p className="text-xs text-zinc-500">{CATEGORIAS[c]}</p>
                  <p className={cx("text-lg font-semibold tabular-nums", notas[c]! >= 8 ? "text-green-700" : notas[c]! >= 5 ? "text-amber-700" : "text-red-700")}>
                    {notas[c]}
                    <span className="text-xs font-normal text-zinc-400">/10</span>
                  </p>
                </div>
              ) : null,
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5" role="tablist">
          {(["todas", ...Object.keys(CATEGORIAS)] as (Categoria | "todas")[]).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={filtro === c}
              onClick={() => setFiltro(c)}
              className={cx("rounded-full border px-3 py-1 text-xs", filtro === c ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
            >
              {c === "todas" ? `Todas (${todos.length})` : `${CATEGORIAS[c]} (${porCategoria(c)})`}
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <p className="text-sm text-zinc-500">{props.emAndamento ? "Nada por enquanto." : "Nenhum achado nesta categoria."}</p>
        ) : (
          <ul className="space-y-2">
            {visiveis.map((a) => {
              const url = link(a);
              return (
                <li key={a.chave} className="rounded-lg border border-zinc-200 p-3">
                  <label className={cx("flex items-start gap-3", !revisao && "cursor-pointer")}>
                    {revisao ? null : (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={marcados.has(a.chave)}
                        onChange={() => alternar(a.chave)}
                        disabled={props.emAndamento}
                        aria-label={`Corrigir: ${a.titulo}`}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={SEVERIDADE[a.severidade].tone}>{SEVERIDADE[a.severidade].label}</Badge>
                        <Badge tone="gray">{CATEGORIAS[a.categoria]}</Badge>
                        {a.origem === "varredura" ? <Badge tone="blue">varredura automática</Badge> : null}
                        {a.persona && PERSONA[a.persona] ? <Badge tone="gray">{PERSONA[a.persona]}</Badge> : null}
                        <span className="font-medium text-zinc-900">{a.titulo}</span>
                      </span>
                      {a.arquivo ? (
                        <span className="mt-1 block font-mono text-xs text-zinc-500">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                              {a.arquivo}
                              {a.linha ? `:${a.linha}` : ""} <ExternalLink size={11} />
                            </a>
                          ) : (
                            `${a.arquivo}${a.linha ? `:${a.linha}` : ""}`
                          )}
                        </span>
                      ) : null}
                      <span className="mt-1.5 block text-sm text-zinc-700">{a.detalhe}</span>
                      <span className="mt-1 block text-sm text-zinc-900">
                        <b>O que fazer:</b> {a.recomendacao}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {revisao && !props.emAndamento ? (
          <div className="flex flex-wrap items-center gap-3">
            {publicado ? (
              <a href={publicado} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 underline">
                Revisão publicada no PR <ExternalLink size={12} />
              </a>
            ) : (
              <>
                <Button
                  variant="brand"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      setErro(null);
                      const r = await comentarNoPRAction(props.taskId);
                      if (r.erro) setErro(r.erro);
                      else if (r.url) setPublicado(r.url);
                    })
                  }
                >
                  {ocupado ? "Publicando…" : "Publicar a revisão no PR"}
                </Button>
                <span className="text-xs text-zinc-500">Vai como comentário de revisão: não aprova nem bloqueia o PR.</span>
              </>
            )}
          </div>
        ) : null}

        {!revisao && !props.emAndamento && todos.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="brand"
              disabled={ocupado || marcados.size === 0}
              onClick={() =>
                iniciar(async () => {
                  setErro(null);
                  const r = await corrigirAchadosAction(props.taskId, [...marcados]);
                  if (r?.erro) setErro(r.erro);
                })
              }
            >
              {ocupado ? "Criando a tarefa…" : `Corrigir com o agente${marcados.size ? ` (${marcados.size})` : ""}`}
            </Button>
            <span className="text-xs text-zinc-500">Nada vai para o GitHub sem a sua aprovação.</span>
          </div>
        ) : null}
        {erro ? <Notice tone="red">{erro}</Notice> : null}
      </div>
    </Card>
  );
}
