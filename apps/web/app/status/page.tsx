import { PROVIDERS, type ProviderId } from "@forja/core";
import { getDb, sql } from "@forja/db";
import { cx } from "@forja/ui";
import { CabecalhoDoSite, RodapeDoSite } from "@/components/site/cabecalho";

export const metadata = { title: "Status", description: "Situação dos serviços da Forja agora." };

type Situacao = "ok" | "instavel" | "fora" | "sem_dados";
const TEXTO: Record<Situacao, { label: string; cor: string }> = {
  ok: { label: "Operando", cor: "bg-emerald-400" },
  instavel: { label: "Instável", cor: "bg-palha" },
  fora: { label: "Fora do ar", cor: "bg-brasa" },
  sem_dados: { label: "Sem uso na última hora", cor: "bg-aco-500" },
};

/** Situação de cada provedor pela taxa de erro da última hora (só contagens: nada de dados de clientes). */
async function situacoes() {
  const inicio = Date.now();
  try {
    const r = await getDb().execute(sql`
      select provider_id, count(*)::int as total, count(*) filter (where status = 'error')::int as erros
      from usage_events where created_at >= now() - interval '60 minutes' group by provider_id`);
    const porProvedor = new Map(r.rows.map((x) => [String(x.provider_id), { total: Number(x.total), erros: Number(x.erros) }]));
    const provedores = (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
      const d = porProvedor.get(id);
      const taxa = d?.total ? d.erros / d.total : 0;
      const s: Situacao = !d || d.total < 5 ? "sem_dados" : taxa >= 0.5 ? "fora" : taxa >= 0.1 ? "instavel" : "ok";
      return { nome: PROVIDERS[id].name, situacao: s };
    });
    return { banco: "ok" as Situacao, latenciaMs: Date.now() - inicio, provedores };
  } catch {
    return { banco: "fora" as Situacao, latenciaMs: null, provedores: [] };
  }
}

function Linha({ nome, situacao, detalhe }: { nome: string; situacao: Situacao; detalhe?: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-aco-100">
        {nome}
        {detalhe ? <span className="ml-2 font-mono text-xs text-aco-300">{detalhe}</span> : null}
      </span>
      <span className="flex items-center gap-2 text-sm text-aco-300">
        <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", TEXTO[situacao].cor)} />
        {TEXTO[situacao].label}
      </span>
    </li>
  );
}

export default async function StatusPage() {
  const s = await situacoes();
  const problemas = [s.banco, ...s.provedores.map((p) => p.situacao)].filter((x) => x === "fora" || x === "instavel").length;
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <div className="acesso relative flex min-h-dvh flex-col">
      <CabecalhoDoSite />
      <main className="relative mx-auto w-full max-w-4xl flex-1 px-6 pb-24 pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">Status · {agora} (Brasília)</p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold uppercase leading-[0.9] text-aco-100">
          {problemas ? (
            <>
              Há <span className="text-brasa">instabilidade</span> agora
            </>
          ) : (
            <>
              Tudo <span className="text-brasa">operando</span>
            </>
          )}
        </h1>
        <p className="mt-4 max-w-2xl text-aco-300">
          A situação dos modelos vem dos pedidos reais da última hora. Recarregue a página para atualizar.
        </p>

        <h2 className="mt-12 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">Plataforma</h2>
        <ul className="mt-3 divide-y divide-aco-800 rounded-lg border border-aco-700 bg-aco-850/70">
          <Linha nome="Aplicativo" situacao="ok" />
          <Linha nome="Banco de dados" situacao={s.banco} detalhe={s.latenciaMs !== null ? `${s.latenciaMs} ms` : undefined} />
        </ul>

        <h2 className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">Modelos de IA</h2>
        <ul className="mt-3 divide-y divide-aco-800 rounded-lg border border-aco-700 bg-aco-850/70">
          {s.provedores.length ? s.provedores.map((p) => <Linha key={p.nome} nome={p.nome} situacao={p.situacao} />) : <Linha nome="Provedores" situacao="sem_dados" />}
        </ul>
        <p className="mt-6 text-sm text-aco-300">
          Algo não funciona para você e aqui aparece tudo certo?{" "}
          <a href="/suporte" className="font-medium text-brasa-claro underline-offset-4 hover:underline">
            Fale com o suporte
          </a>
          .
        </p>
      </main>
      <RodapeDoSite />
    </div>
  );
}
