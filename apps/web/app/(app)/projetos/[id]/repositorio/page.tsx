import { FERRAMENTAS_DO_TIME, githubApp, instalacaoDaOrg, PERSONAS_DA_AUDITORIA, PERSONAS_DA_REVISAO, type EstruturaDoRepositorio, type FerramentaDoTime } from "@forja/agent";
import { and, eq, schema } from "@forja/db";
import { Badge, buttonClass, Card, CardHeader, Field, inputClass, Notice, PageHeader } from "@forja/ui";
import { FolderGit2, GitPullRequest, ScanSearch, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { EscolhaDoTime } from "@/components/escolha-do-time";
import { modelosDoAgente, PREFERIDOS_DO_AGENTE } from "@/lib/agente";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { getSession } from "@/lib/session";
import { criarAuditoriaAction, criarRevisaoAction, instalarTimeAction } from "../../../agente/actions";
import { atualizarEstruturaAction, conectarRepositorioAction, desconectarRepositorioAction } from "./actions";

export const metadata = { title: "Repositório do projeto" };
// ler a estrutura baixa o repositório; a auditoria começa logo depois de criada
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kb = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function RepositorioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { db, org, plan } = await getSession();
  const projeto = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.orgId, org.id)) });
  if (!projeto) notFound();

  const instalacao = await instalacaoDaOrg(db, org.id);
  const gh = instalacao ? await githubApp() : null;
  let repos: { fullName: string; private: boolean }[] = [];
  let erroRepos: string | null = null;
  if (instalacao && gh) {
    try {
      repos = await gh.repositorios(instalacao.installationId);
    } catch {
      erroRepos = "Não consegui listar os repositórios no GitHub agora. Recarregue em instantes.";
    }
  }
  const estrutura = (projeto.repoSnapshot ?? null) as EstruturaDoRepositorio | null;
  const modelos = modelosDoAgente(await listModelOptions(db, plan?.allowedTiers ?? []));
  const padrao = defaultModelFor(modelos, PREFERIDOS_DO_AGENTE);
  const CampoModelo = () => (
    <Field label="Modelo">
      <select name="modelo" defaultValue={padrao} className={inputClass}>
        {modelos.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.allowed}>
            {m.displayName}
            {m.allowed ? "" : " (plano superior)"}
          </option>
        ))}
      </select>
    </Field>
  );
  const totalLinguagens = estrutura?.linguagens.reduce((s, l) => s + l.bytes, 0) || 1;

  return (
    <>
      <PageHeader
        title={`Repositório · ${projeto.name}`}
        description="Ligue o repositório do GitHub ao projeto. A Forja lê a estrutura (linguagens, stack, pastas, instruções de assistentes de IA e README) e usa isso no chat, na call e na auditoria."
        actions={
          <Link href={`/projetos/${projeto.id}`} className={buttonClass("ghost", "sm")}>
            Voltar ao projeto
          </Link>
        }
      />
      <div className="mb-4 space-y-2">
        {ok ? <Notice tone="blue">Estrutura lida. O chat do projeto já conhece o repositório.</Notice> : null}
        {!instalacao ? (
          <Notice>
            Conecte o GitHub para escolher o repositório.{" "}
            <Link href="/agente" className="font-medium underline">
              Conectar em Agente
            </Link>
          </Notice>
        ) : null}
        {erroRepos ? <Notice tone="red">{erroRepos}</Notice> : null}
      </div>

      {instalacao && !erroRepos ? (
        <Card className="mb-6 p-5">
          <ActionForm action={conectarRepositorioAction} submit={estrutura ? "Trocar e ler a estrutura" : "Conectar e ler a estrutura"} pending="Lendo o repositório…" variant={estrutura ? "secondary" : "brand"}>
            <input type="hidden" name="projeto" value={projeto.id} />
            <Field label="Repositório" hint={`Os que o app Forja Agentes enxerga em ${instalacao.accountLogin}. Para liberar outros, ajuste o acesso do app no GitHub.`}>
              <select name="repo" required defaultValue={projeto.repoFullName ?? repos[0]?.fullName} className={inputClass}>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                    {r.private ? " (privado)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {estrutura ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <FolderGit2 size={15} /> {estrutura.repo}
                  </span>
                }
                description={`Branch ${estrutura.branch} · ${estrutura.arquivos.toLocaleString("pt-BR")} arquivos · ${kb(estrutura.bytes)} · lido em ${projeto.repoSnapshotAt ? quando(projeto.repoSnapshotAt) : "—"}`}
                actions={
                  <div className="flex gap-2">
                    <ActionForm action={atualizarEstruturaAction} submit="Atualizar" pending="Lendo…" variant="secondary" className="flex">
                      <input type="hidden" name="projeto" value={projeto.id} />
                      <input type="hidden" name="repo" value={estrutura.repo} />
                    </ActionForm>
                  </div>
                }
              />
              <div className="space-y-5 p-5 text-sm">
                {estrutura.stack.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-500">Stack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {estrutura.stack.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {estrutura.linguagens.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-500">Linguagens</p>
                    <ul className="space-y-1.5">
                      {estrutura.linguagens.map((l) => (
                        <li key={l.nome} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3">
                          <span className="text-zinc-700">{l.nome}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                            <span className="block h-full rounded-full bg-zinc-700" style={{ width: `${Math.max(2, (l.bytes / totalLinguagens) * 100)}%` }} />
                          </span>
                          <span className="text-right text-xs tabular-nums text-zinc-500">{l.arquivos} arq.</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Object.keys(estrutura.scripts).length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-500">Scripts (package.json)</p>
                    <ul className="space-y-1 font-mono text-xs">
                      {Object.entries(estrutura.scripts).map(([k, v]) => (
                        <li key={k} className="truncate">
                          <span className="text-zinc-900">{k}</span> <span className="text-zinc-500">{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Pastas e arquivos</p>
                  <ul className="max-h-80 overflow-auto rounded-lg border border-zinc-100 font-mono text-xs">
                    {estrutura.arvore.map((n) => (
                      <li key={n.caminho} className="flex justify-between gap-3 border-b border-zinc-50 px-3 py-1 last:border-0">
                        <span className={n.caminho.includes("/") ? "pl-4 text-zinc-600" : "text-zinc-900"}>
                          {n.caminho.split("/").at(-1)}
                          {n.tipo === "pasta" ? "/" : ""}
                        </span>
                        <span className="shrink-0 text-zinc-400">{n.tipo === "pasta" ? `${n.arquivos} arq. · ${kb(n.bytes)}` : kb(n.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {estrutura.readme ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500">README (começo)</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">{estrutura.readme}</pre>
                  </details>
                ) : null}
                <form action={desconectarRepositorioAction}>
                  <input type="hidden" name="projeto" value={projeto.id} />
                  <button className="text-xs text-zinc-500 underline hover:text-zinc-800">Desligar o repositório do projeto</button>
                </form>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <ScanSearch size={15} /> Analisar o projeto
                  </span>
                }
                description="Auditoria do time da Forja: overview, arquitetura, bugs, testes, segurança, desempenho e economia de tokens. Só leitura; você recebe um relatório com o parecer de cada especialista e pode mandar o agente corrigir."
              />
              <div className="p-5">
                <ActionForm action={criarAuditoriaAction} submit="Começar a auditoria" pending="Preparando…" variant="brand">
                  <input type="hidden" name="projeto" value={projeto.id} />
                  <input type="hidden" name="repo" value={estrutura.repo} />
                  <EscolhaDoTime padrao={PERSONAS_DA_AUDITORIA} />
                  <CampoModelo />
                  <Field label="Teto de gasto (R$)" hint="O agente para quando chegar nele e entrega o que já encontrou.">
                    <input name="teto" inputMode="decimal" defaultValue="10" className={inputClass} />
                  </Field>
                  <Field label="Foco (opcional)" hint="Ex.: “Olhe principalmente a autenticação e as rotas da API.”">
                    <textarea name="foco" rows={3} maxLength={2000} className={inputClass} />
                  </Field>
                </ActionForm>
              </div>
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <GitPullRequest size={15} /> Revisar um pull request
                  </span>
                }
                description="O QA da Forja revisa o PR, venha ele de uma pessoa ou do seu Claude Code, Codex, Gemini CLI ou Grok Build: bugs, casos de borda, testes que faltam e segurança, com um veredito. Você pode publicar a revisão no próprio PR."
              />
              <div className="p-5">
                <ActionForm action={criarRevisaoAction} submit="Revisar o pull request" pending="Lendo o PR…" variant="secondary">
                  <input type="hidden" name="projeto" value={projeto.id} />
                  <input type="hidden" name="repo" value={estrutura.repo} />
                  <Field label="Número do pull request" hint={`Em ${estrutura.repo}. Ex.: 42`}>
                    <input name="pr" inputMode="numeric" required placeholder="42" className={inputClass} />
                  </Field>
                  <EscolhaDoTime padrao={PERSONAS_DA_REVISAO} legenda="Quem revisa" />
                  <CampoModelo />
                  <Field label="Teto de gasto (R$)">
                    <input name="teto" inputMode="decimal" defaultValue="5" className={inputClass} />
                  </Field>
                </ActionForm>
              </div>
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Users size={15} /> Construir com a sua assinatura
                  </span>
                }
                description="Instale o time da Forja no repositório e use o Claude Code, o Codex, o Gemini CLI ou o Grok Build com o seu próprio plano: os especialistas viram subagentes, skills e instruções da ferramenta. Depois peça a revisão de QA do PR aqui."
              />
              <div className="p-5">
                <ActionForm action={instalarTimeAction} submit="Abrir PR com o time" pending="Abrindo o PR…" variant="secondary">
                  <input type="hidden" name="repo" value={estrutura.repo} />
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium text-zinc-900">Ferramentas da sua equipe</legend>
                    <div className="space-y-2">
                      {(Object.keys(FERRAMENTAS_DO_TIME) as FerramentaDoTime[]).map((f) => (
                        <label key={f} className="flex cursor-pointer items-start gap-2 text-sm">
                          <input type="checkbox" name="ferramenta" value={f} defaultChecked={f === "claude_code"} className="mt-0.5" />
                          <span>
                            <span className="font-medium text-zinc-900">{FERRAMENTAS_DO_TIME[f].nome}</span>{" "}
                            <span className="text-xs text-zinc-500">({FERRAMENTAS_DO_TIME[f].arquivos})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </ActionForm>
                <p className="mt-3 text-xs text-zinc-500">
                  <Link href="/assistentes/time" className="underline">
                    Ver os arquivos antes
                  </Link>{" "}
                  · A Forja nunca usa o seu login nessas ferramentas: elas rodam na sua máquina, com a sua conta.
                </p>
              </div>
            </Card>

            {estrutura.configsDeIa.length ? (
              <Card>
                <CardHeader title="Instruções de assistentes de IA" description="Carregadas em toda sessão do Claude Code, Codex, Gemini CLI ou Cursor: cada token aqui se paga em toda conversa." />
                <ul className="divide-y divide-zinc-100 text-sm">
                  {estrutura.configsDeIa.map((c) => (
                    <li key={c.caminho} className="flex justify-between gap-3 px-5 py-2">
                      <span className="min-w-0 truncate font-mono text-xs text-zinc-700">{c.caminho}</span>
                      <span className={c.tokensAprox > 2_000 ? "shrink-0 text-xs font-medium text-amber-700" : "shrink-0 text-xs text-zinc-500"}>
                        ≈ {c.tokensAprox.toLocaleString("pt-BR")} tokens
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {estrutura.avisos.length ? (
              <Card>
                <CardHeader title="Pontos de atenção" description="Encontrados na leitura, sem custo." />
                <ul className="space-y-2 p-5 text-sm text-zinc-700">
                  {estrutura.avisos.map((a) => (
                    <li key={a}>• {a}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Link href={`/agente/nova?projeto=${projeto.id}`} className={buttonClass("secondary", "sm")}>
              Pedir uma mudança ao agente
            </Link>
          </div>
        </div>
      ) : instalacao ? (
        <Card className="p-8 text-center text-sm text-zinc-500">Escolha o repositório acima: a estrutura aparece aqui.</Card>
      ) : null}
    </>
  );
}
