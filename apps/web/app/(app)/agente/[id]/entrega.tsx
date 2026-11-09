"use client";

import { Badge, Button, Card, CardHeader, cx, inputClass, Notice } from "@forja/ui";
import { Database, ExternalLink, Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { aplicarMigracoesAction, criarProjetoSupabaseAction, publicarPreviewAction } from "../actions";

interface Preview {
  estado: string | null;
  url: string | null;
  erro: string | null;
}
interface ResultadoDaMigracao {
  path: string;
  ok: boolean;
  erro?: string;
}
interface ProjetoSupabase {
  ref: string;
  nome: string;
  status: string;
  regiao: string;
}

const FINAL = new Set(["READY", "ERROR", "CANCELED"]);
const NOVO = "__novo__";

export function Entrega(props: {
  taskId: string;
  preview: Preview;
  vercelConectada: boolean;
  migracoes: string[];
  supabaseConectado: boolean;
  projetos: ProjetoSupabase[] | null;
  erroProjetos: string | null;
  supabaseRef: string | null;
  resultados: ResultadoDaMigracao[];
  podeGerenciar: boolean;
}) {
  const [preview, setPreview] = useState(props.preview);
  const [resultados, setResultados] = useState(props.resultados);
  const [projetos, setProjetos] = useState(props.projetos ?? []);
  const [ref, setRef] = useState(props.supabaseRef ?? props.projetos?.[0]?.ref ?? NOVO);
  const [nome, setNome] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const publicando = Boolean(preview.estado && !FINAL.has(preview.estado));

  const consultar = useCallback(async () => {
    const r = await fetch(`/api/agente/tarefas/${props.taskId}/entrega`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { preview: Preview; supabase: { migracoes: ResultadoDaMigracao[] } };
    setPreview(j.preview);
    setResultados(j.supabase.migracoes);
  }, [props.taskId]);

  // o preview automático começa logo depois da aprovação: consulta até a Vercel terminar o build
  useEffect(() => {
    if (!props.vercelConectada) return;
    if (preview.estado && FINAL.has(preview.estado)) return;
    const t = setInterval(() => void consultar(), 4000);
    return () => clearInterval(t);
  }, [props.vercelConectada, preview.estado, consultar]);

  const publicar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await publicarPreviewAction(props.taskId);
      if (r.erro) setErro(r.erro);
      await consultar();
    });

  const projetoEscolhido = projetos.find((p) => p.ref === ref);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Rocket size={15} /> Preview na Vercel
            </span>
          }
          description="Cada PR do agente ganha um endereço para você testar antes do merge. O link também aparece na conversa."
        />
        <div className="space-y-3 p-5 text-sm">
          {!props.vercelConectada ? (
            <p className="text-zinc-600">
              Conecte a Vercel em{" "}
              <Link href="/conectores" className="font-medium underline">
                Conectores
              </Link>{" "}
              para publicar o preview deste PR.
            </p>
          ) : publicando ? (
            <p className="inline-flex items-center gap-2 text-zinc-700">
              <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> Publicando ({preview.estado?.toLowerCase()}). O build leva de 1 a 3
              minutos.
            </p>
          ) : preview.estado === "READY" && preview.url ? (
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 font-medium text-white hover:bg-zinc-700"
              >
                Abrir o preview <ExternalLink size={14} />
              </a>
              <span className="min-w-0 truncate font-mono text-xs text-zinc-500">{preview.url.replace("https://", "")}</span>
            </div>
          ) : !preview.estado ? (
            <p className="text-zinc-600">O preview ainda não foi publicado.</p>
          ) : null}
          {preview.erro && !publicando ? <Notice tone="red">{preview.erro}</Notice> : null}
          {props.vercelConectada && !publicando ? (
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={publicar}>
              {ocupado ? "Pedindo à Vercel…" : preview.estado ? "Publicar de novo" : "Publicar o preview"}
            </Button>
          ) : null}
          {erro ? <Notice tone="red">{erro}</Notice> : null}
        </div>
      </Card>

      {props.migracoes.length ? (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Database size={15} /> Banco no Supabase
              </span>
            }
            description="O agente escreveu migrações. Aplique num projeto seu: cada uma roda inteira ou não roda, e fica no histórico do Supabase CLI."
          />
          <div className="space-y-4 p-5 text-sm">
            <ul className="space-y-1">
              {props.migracoes.map((m) => {
                const r = resultados.find((x) => x.path === m);
                return (
                  <li key={m} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-all font-mono text-xs text-zinc-700">{m}</span>
                    {r ? <Badge tone={r.ok ? "green" : "red"}>{r.ok ? (r.erro ? "já estava" : "aplicada") : "falhou"}</Badge> : null}
                  </li>
                );
              })}
            </ul>
            {resultados.filter((r) => !r.ok).map((r) => (
              <Notice key={r.path} tone="red">
                <span className="font-mono text-xs">{r.path}</span>: {r.erro}
              </Notice>
            ))}

            {!props.supabaseConectado ? (
              <p className="text-zinc-600">
                Conecte o Supabase em{" "}
                <Link href="/conectores" className="font-medium underline">
                  Conectores
                </Link>{" "}
                para aplicar as migrações.
              </p>
            ) : !props.podeGerenciar ? (
              <p className="text-zinc-600">Só donos e administradores aplicam migrações no banco.</p>
            ) : props.erroProjetos ? (
              <Notice tone="red">{props.erroProjetos}</Notice>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">Projeto</span>
                  <select value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass}>
                    {projetos.map((p) => (
                      <option key={p.ref} value={p.ref}>
                        {p.nome} ({p.ref}){p.status && p.status !== "ACTIVE_HEALTHY" ? ` · ${p.status.toLowerCase()}` : ""}
                      </option>
                    ))}
                    <option value={NOVO}>+ Criar um projeto novo (São Paulo)</option>
                  </select>
                </label>
                {ref === NOVO ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do projeto" className={cx(inputClass, "sm:flex-1")} />
                    <Button
                      variant="secondary"
                      disabled={ocupado || nome.trim().length < 3}
                      onClick={() =>
                        iniciar(async () => {
                          if (!window.confirm("Criar um projeto novo no seu Supabase? No plano gratuito cabem 2 projetos ativos; nos planos pagos, cada projeto pode gerar cobrança do Supabase.")) return;
                          setErro(null);
                          const r = await criarProjetoSupabaseAction(props.taskId, nome);
                          if (r.erro || !r.ref) return setErro(r.erro ?? "Não consegui criar o projeto.");
                          setProjetos((ps) => [...ps, { ref: r.ref!, nome: nome.trim(), status: "COMING_UP", regiao: "sa-east-1" }]);
                          setRef(r.ref);
                          setAviso("Projeto criado. O Supabase leva 1 ou 2 minutos para deixar o banco pronto; depois aplique as migrações.");
                        })
                      }
                    >
                      Criar projeto
                    </Button>
                  </div>
                ) : (
                  <>
                    <label className="flex items-start gap-2 text-zinc-700">
                      <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5" />
                      <span>
                        Revisei o SQL dessas migrações nas mudanças acima e entendo que ele roda com permissão total no banco do projeto{" "}
                        <b>{projetoEscolhido?.nome ?? ref}</b>. Prefira um projeto de teste antes do de produção.
                      </span>
                    </label>
                    <Button
                      variant="brand"
                      disabled={ocupado || !confirmado}
                      onClick={() =>
                        iniciar(async () => {
                          setErro(null);
                          setAviso(null);
                          const r = await aplicarMigracoesAction(props.taskId, ref);
                          if (r.erro) return setErro(r.erro);
                          setResultados(r.resultados ?? []);
                          setConfirmado(false);
                          const falhou = r.resultados?.some((x) => !x.ok);
                          setAviso(falhou ? null : "Migrações aplicadas.");
                        })
                      }
                    >
                      {ocupado ? "Aplicando…" : `Aplicar ${props.migracoes.length} migração${props.migracoes.length > 1 ? "ões" : ""}`}
                    </Button>
                  </>
                )}
              </>
            )}
            {aviso ? <Notice tone="blue">{aviso}</Notice> : null}
            {erro ? <Notice tone="red">{erro}</Notice> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
