import { desc, eq, schema } from "@forja/db";
import { FERRAMENTAS, gastoDasApis, PROVEDORES_DE_GASTO, resumoDeUso, type Ferramenta } from "@forja/insights";
import { Badge, Button, buttonClass, Card, CardHeader, cx, EmptyState, Notice, PageHeader, Stat, Table, Td, Th } from "@forja/ui";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { revogarFonteAction } from "./actions";
import { ConectarFerramenta } from "./conectar";

export const metadata = { title: "Minhas IAs" };

/** As contas que o cliente já tem, cada uma ligada pela ferramenta de código dela. */
const CONTAS: { nome: string; empresa: string; planos: string; ferramenta: Ferramenta; gasto?: "anthropic_admin" | "openai_admin" }[] = [
  { nome: "Claude", empresa: "Anthropic", planos: "Pro, Max, Team ou API", ferramenta: "claude_code", gasto: "anthropic_admin" },
  { nome: "ChatGPT", empresa: "OpenAI", planos: "Plus, Pro, Business ou API", ferramenta: "codex", gasto: "openai_admin" },
  { nome: "Gemini", empresa: "Google", planos: "Google AI Pro, Ultra ou API", ferramenta: "gemini_cli" },
  { nome: "Grok", empresa: "xAI", planos: "SuperGrok ou API", ferramenta: "grok_build" },
];

const quando = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca");
const mil = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} bi` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n);
const usd = (micros: number) => `US$ ${(micros / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const IMPACTO = { alto: { label: "economia alta", tone: "red" as const }, medio: { label: "economia média", tone: "amber" as const }, baixo: { label: "ajuste fino", tone: "gray" as const } };

export default async function AssistentesPage() {
  const { db, org } = await getSession();
  const [fontes, resumo, gastos] = await Promise.all([
    db.select().from(schema.aiTelemetrySources).where(eq(schema.aiTelemetrySources.orgId, org.id)).orderBy(desc(schema.aiTelemetrySources.createdAt)).limit(100),
    resumoDeUso(db, org.id, 30),
    gastoDasApis(db, org.id, { dias: 30 }),
  ]);
  const ativas = fontes.filter((f) => !f.revokedAt);
  const total = resumo.usos.reduce(
    (s, u) => ({
      req: s.req + u.requisicoes,
      entrada: s.entrada + u.inputTokens,
      saida: s.saida + u.outputTokens,
      cache: s.cache + u.cacheReadTokens,
      escrita: s.escrita + u.cacheWriteTokens,
      custo: s.custo + u.costUsdMicros,
    }),
    { req: 0, entrada: 0, saida: 0, cache: 0, escrita: 0, custo: 0 },
  );
  const contexto = total.entrada + total.cache + total.escrita;
  const maxDia = Math.max(1, ...resumo.porDia.map((d) => d.tokens));

  return (
    <>
      <PageHeader
        title="Minhas IAs"
        description="Conecte aqui as contas de IA que você já usa: Claude, ChatGPT, Gemini e Grok. A Forja passa a mostrar quantos tokens cada uma gasta, quanto isso custa e como gastar menos. Vale para assinatura (Pro, Max, Plus…) e para API."
        actions={
          <Link href="/assistentes/time" className={buttonClass("secondary", "sm")}>
            Ver o time de especialistas
          </Link>
        }
      />

      <h2 className="mb-1 text-sm font-semibold text-zinc-900">Contas de IA</h2>
      <p className="mb-3 max-w-3xl text-sm text-zinc-600">
        Cada conta se conecta pela ferramenta de código dela, que você já tem instalada. Ela envia só os números de cada pedido (modelo, tokens, custo e duração). Seus
        prompts, respostas e código não saem da sua máquina.
      </p>
      <div className="mb-3 grid gap-4 md:grid-cols-2" data-testid="contas-de-ia">
        {CONTAS.map((c) => {
          const fontes = ativas.filter((f) => f.tool === c.ferramenta);
          const visto = fontes.map((f) => f.lastSeenAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
          const gasto = c.gasto ? gastos.find((g) => g.provedor === c.gasto) : undefined;
          return (
            <Card key={c.ferramenta} className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-zinc-900">{c.nome}</p>
                  <p className="text-xs text-zinc-500">
                    {c.empresa} · {c.planos}
                  </p>
                </div>
                {fontes.length ? (
                  <Badge tone={visto ? "green" : "amber"}>{visto ? "conectada" : "aguardando o primeiro uso"}</Badge>
                ) : (
                  <Badge tone="gray">não conectada</Badge>
                )}
              </div>
              <p className="mb-3 text-sm text-zinc-700">
                {fontes.length
                  ? `${fontes.length} ${fontes.length === 1 ? "máquina conectada" : "máquinas conectadas"} pelo ${FERRAMENTAS[c.ferramenta].nome}. ${visto ? `Último uso recebido ${quando(visto)}.` : "Abra a ferramenta e faça um pedido para o uso aparecer."}`
                  : `Conecte pelo ${FERRAMENTAS[c.ferramenta].nome}: gere a configuração, cole no arquivo indicado e reabra a ferramenta.`}
              </p>
              <ConectarFerramenta tool={c.ferramenta} nome={FERRAMENTAS[c.ferramenta].nome} />
              {c.gasto ? (
                <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                  {gasto ? (
                    <>
                      Gasto real da API conectado: <b className="text-zinc-900">{usd(gasto.totalUsdMicros)}</b> em 30 dias.{" "}
                    </>
                  ) : (
                    <>Usa a API da {c.empresa} em produção? Conecte a chave de administração para ver o valor cobrado de verdade. </>
                  )}
                  <Link href="/conectores" className="font-medium text-zinc-900 underline">
                    {gasto ? "Gerenciar" : "Conectar o gasto da API"}
                  </Link>
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="font-medium text-zinc-900">No app para computador é um clique</p>
          <p className="mt-1 text-sm text-zinc-600">
            O app da Forja acha o Claude Code, o Codex e o Gemini CLI instalados e grava a configuração para você, mostrando antes o que muda.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/computador" className={buttonClass("secondary", "sm")}>
              Abrir Este computador
            </Link>
            <Link href="/baixar" className={buttonClass("ghost", "sm")}>
              Baixar o app
            </Link>
          </div>
        </Card>
        <Card className="p-5">
          <p className="font-medium text-zinc-900">Usa outra IA?</p>
          <p className="mt-1 text-sm text-zinc-600">
            DeepSeek, Mistral, Cursor, Copilot, Windsurf e outras ainda não mandam o uso para a Forja. Conte qual você usa: a ordem de entrada segue os pedidos.
          </p>
          <Link href="/suporte" className={cx(buttonClass("secondary", "sm"), "mt-3")}>
            Pedir outra IA
          </Link>
        </Card>
      </div>

      <details className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700">
        <summary className="cursor-pointer font-medium text-zinc-900">Por que não existe o botão "Entrar com o ChatGPT" ou "Entrar com o Claude"?</summary>
        <p className="mt-2">
          Porque os termos da Anthropic, da Google e da OpenAI proíbem que outro produto use o login da sua assinatura. Quem faz isso arrisca a conta do cliente. A Forja
          nunca pede a sua senha nem o seu token dessas contas: quem fala com o modelo é a ferramenta oficial, na sua máquina, e ela só nos conta os números.
        </p>
      </details>

      <Card className="mb-6">
        <CardHeader
          title="Construa com a sua conta, revise com a Forja"
          description="O caminho completo para quem já paga uma IA."
        />
        <ol className="grid gap-3 px-5 pb-5 text-sm text-zinc-700 md:grid-cols-4">
          <li className="rounded-lg bg-zinc-50 p-3">
            <b className="block text-zinc-900">1. Conecte a conta</b>
            Acima. Em minutos o uso começa a aparecer aqui, por ferramenta, modelo, dia e pessoa.
          </li>
          <li className="rounded-lg bg-zinc-50 p-3">
            <b className="block text-zinc-900">2. Instale o time</b>
            No repositório do projeto: Dev Sênior, Dev Pleno, QA Pleno e Cyber Security Pleno viram subagentes e instruções da sua ferramenta.
          </li>
          <li className="rounded-lg bg-zinc-50 p-3">
            <b className="block text-zinc-900">3. Construa como sempre</b>
            Com a sua conta e o seu plano. Nada passa pela Forja nem gasta os seus créditos daqui.
          </li>
          <li className="rounded-lg bg-zinc-50 p-3">
            <b className="block text-zinc-900">4. Peça a revisão de QA</b>
            No projeto, em Repositório: o QA e a segurança da Forja revisam o pull request e publicam o parecer nele.
          </li>
        </ol>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Gasto real nas APIs (30 dias)"
          description="Lido dos relatórios de custo da sua organização na Anthropic e na OpenAI, com uma chave de administração (só leitura de relatórios). Atualiza a cada hora."
          actions={
            <Link href="/conectores" className={buttonClass("secondary", "sm")}>
              {gastos.length ? "Gerenciar chaves" : "Conectar chave de administração"}
            </Link>
          }
        />
        {gastos.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">
            Nenhuma chave de administração conectada. Com ela, a Forja mostra o valor cobrado pela API (não uma estimativa) e compara com o uso das ferramentas.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {gastos.map((g) => {
              const max = Math.max(1, ...g.dias.map((d) => d.usdMicros));
              return (
                <li key={g.conectorId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-end">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{PROVEDORES_DE_GASTO[g.provedor]}</p>
                    <p className="text-2xl font-semibold tabular-nums text-zinc-900">{usd(g.totalUsdMicros)}</p>
                    <p className="text-xs text-zinc-500">
                      {g.erro ? <span className="text-red-700">Não deu para atualizar: {g.erro}.</span> : `atualizado ${quando(new Date(g.atualizadoEm))}`}
                    </p>
                  </div>
                  <div className="flex h-16 items-end gap-0.5" role="img" aria-label={`Gasto por dia em ${PROVEDORES_DE_GASTO[g.provedor]}`}>
                    {g.dias.map((d) => (
                      <div
                        key={d.dia}
                        title={`${d.dia.split("-").reverse().join("/")}: ${usd(d.usdMicros)}`}
                        className="flex-1 rounded-t bg-zinc-800"
                        style={{ height: `${Math.max(3, (d.usdMicros / max) * 100)}%` }}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {resumo.usos.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            title="Nenhum uso recebido ainda"
            description="Gere a configuração da ferramenta, cole no arquivo indicado e abra uma sessão nova. Os primeiros números chegam em poucos segundos."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pedidos ao modelo (30 dias)" value={mil(total.req)} />
            <Stat label="Tokens processados" value={mil(contexto + total.saida)} hint={`${mil(total.saida)} de saída`} />
            <Stat
              label="Vindo do cache"
              value={contexto ? `${Math.round((total.cache / contexto) * 100)}%` : "—"}
              hint="quanto do contexto saiu do cache (≈ 10% do preço)"
              tone={contexto && total.cache / contexto < 0.6 ? "bad" : "good"}
            />
            <Stat label="Equivalente em API" value={total.custo ? usd(total.custo) : "—"} hint="estimativa das ferramentas que informam; com assinatura, não é o que você paga" />
          </div>

          {resumo.recomendacoes.length ? (
            <Card className="mb-6">
              <CardHeader title="Como gastar menos" description="Calculado com o uso dos últimos 30 dias." />
              <ul className="divide-y divide-zinc-100">
                {resumo.recomendacoes.map((r) => (
                  <li key={r.titulo + r.ferramenta} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={IMPACTO[r.impacto].tone}>{IMPACTO[r.impacto].label}</Badge>
                      {r.ferramenta ? <Badge tone="gray">{FERRAMENTAS[r.ferramenta].nome}</Badge> : null}
                      <span className="font-medium text-zinc-900">{r.titulo}</span>
                    </div>
                    <p className="mt-1 text-zinc-600">{r.detalhe}</p>
                    <p className="mt-1 text-zinc-900">
                      <b>Como fazer:</b> {r.comoFazer}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="mb-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Por ferramenta e modelo" />
              <Table>
                <thead>
                  <tr>
                    <Th>Ferramenta</Th>
                    <Th>Modelo</Th>
                    <Th className="text-right">Pedidos</Th>
                    <Th className="text-right">Entrada</Th>
                    <Th className="text-right">Cache</Th>
                    <Th className="text-right">Saída</Th>
                    <Th className="text-right">Equiv. API</Th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.usos.map((u) => (
                    <tr key={u.tool + u.model}>
                      <Td>{FERRAMENTAS[u.tool]?.nome ?? u.tool}</Td>
                      <Td className="font-mono text-xs">{u.model || "—"}</Td>
                      <Td className="text-right tabular-nums">{mil(u.requisicoes)}</Td>
                      <Td className="text-right tabular-nums">{mil(u.inputTokens)}</Td>
                      <Td className="text-right tabular-nums">{mil(u.cacheReadTokens)}</Td>
                      <Td className="text-right tabular-nums">{mil(u.outputTokens + u.reasoningTokens)}</Td>
                      <Td className="text-right tabular-nums">{u.costUsdMicros ? usd(u.costUsdMicros) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Tokens por dia" />
              <div className="flex h-40 items-end gap-1 px-5 pb-5" role="img" aria-label="Tokens processados por dia nos últimos 30 dias">
                {resumo.porDia.map((d) => (
                  <div
                    key={d.dia}
                    title={`${d.dia.split("-").reverse().join("/")}: ${mil(d.tokens)} tokens, ${d.requisicoes} pedidos`}
                    className="flex-1 rounded-t bg-zinc-800"
                    style={{ height: `${Math.max(3, (d.tokens / maxDia) * 100)}%` }}
                  />
                ))}
              </div>
              {resumo.porPessoa.some((p) => p.actor) ? (
                <>
                  <CardHeader title="Por pessoa" />
                  <ul className="divide-y divide-zinc-100 text-sm">
                    {resumo.porPessoa.map((p) => (
                      <li key={p.actor ?? "?"} className="flex justify-between gap-3 px-5 py-2">
                        <span className="min-w-0 truncate text-zinc-700">{p.actor ?? "sem identificação"}</span>
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{mil(p.tokens)} tokens</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader title={`Fontes (${ativas.length} ativa${ativas.length === 1 ? "" : "s"})`} description="Cada fonte tem o próprio token. Revogue a de uma máquina que não usa mais." />
        {fontes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">Nenhuma ainda.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Ferramenta</Th>
                <Th>Token</Th>
                <Th>Último envio</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {fontes.map((f) => (
                <tr key={f.id} className={cx(f.revokedAt && "opacity-50")}>
                  <Td>{f.label}</Td>
                  <Td>{FERRAMENTAS[f.tool as Ferramenta]?.nome ?? f.tool}</Td>
                  <Td className="font-mono text-xs">••••{f.tokenHint}</Td>
                  <Td className="text-xs">{f.revokedAt ? "revogada" : quando(f.lastSeenAt)}</Td>
                  <Td className="text-right">
                    {f.revokedAt ? null : (
                      <form action={revogarFonteAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <Button variant="ghost" size="sm">
                          Revogar
                        </Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-6">
        <Notice tone="blue">
          Privacidade: a configuração gerada manda só os números de cada pedido ao modelo (modelo, tokens, cache, tempo e o e-mail da conta da
          ferramenta). Prompts, respostas e código não são enviados. Os dados ficam 180 dias.
        </Notice>
      </div>
    </>
  );
}
