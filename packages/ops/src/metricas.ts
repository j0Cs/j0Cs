/**
 * Métricas do beta fechado para o painel do dono: funil do cadastro à assinatura, modelos mais
 * usados, aproveitamento de cache e uso por cliente (a margem é calculada na tela, com o câmbio atual).
 */
import { sql, type Db } from "@forja/db";

export interface MetricasDoBeta {
  dias: number;
  funil: { cadastros: number; emailConfirmado: number; primeiraResposta: number; respostaEm10Min: number; assinantes: number };
  ativasNaSemana: number;
  cache: { entrada: number; lido: number; escrito: number; saida: number };
  modelos: { modelId: string; requisicoes: number; tokens: number; chargeBrlMicros: number; costUsdMicros: number }[];
  clientes: {
    orgId: string;
    nome: string;
    plano: string | null;
    convite: string | null;
    requisicoes: number;
    chargeBrlMicros: number;
    costUsdMicros: number;
    ultimoUso: string | null;
  }[];
}

const n = (v: unknown) => Number(v ?? 0);

export async function metricasDoBeta(db: Db, dias = 30): Promise<MetricasDoBeta> {
  const desde = sql`now() - make_interval(days => ${dias})`;
  const [funil, semana, cache, modelos, clientes] = await Promise.all([
    db.execute(sql`
      with novas as (
        select o.id, o.created_at, o.plan_id,
          (select bool_or(u.email_verified) from memberships m join users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner') as confirmado,
          (select min(e.created_at) from usage_events e where e.org_id = o.id and e.status = 'ok') as primeira
        from organizations o where o.created_at >= ${desde}
      )
      select count(*)::int as cadastros,
        count(*) filter (where confirmado)::int as confirmados,
        count(*) filter (where primeira is not null)::int as responderam,
        count(*) filter (where primeira is not null and primeira <= created_at + interval '10 minutes')::int as em10,
        count(*) filter (where plan_id is not null and plan_id <> 'trial')::int as assinantes
      from novas`),
    db.execute(sql`select count(distinct org_id)::int as ativas from usage_events where status = 'ok' and created_at >= now() - interval '7 days'`),
    db.execute(sql`
      select coalesce(sum(input_tokens), 0) as entrada, coalesce(sum(cache_read_tokens), 0) as lido,
        coalesce(sum(cache_write_tokens), 0) as escrito, coalesce(sum(output_tokens), 0) as saida
      from usage_events where status = 'ok' and created_at >= ${desde}`),
    db.execute(sql`
      select model_id, count(*)::int as requisicoes,
        sum(input_tokens + cache_read_tokens + cache_write_tokens + output_tokens) as tokens,
        sum(charge_brl_micros) as cobrado, sum(cost_usd_micros) as custo
      from usage_events where status = 'ok' and created_at >= ${desde}
      group by model_id order by count(*) desc limit 20`),
    db.execute(sql`
      select o.id, o.name, o.plan_id, b.label as convite, count(e.id)::int as requisicoes,
        coalesce(sum(e.charge_brl_micros), 0) as cobrado, coalesce(sum(e.cost_usd_micros), 0) as custo, max(e.created_at) as ultimo
      from organizations o
      left join usage_events e on e.org_id = o.id and e.status = 'ok' and e.created_at >= ${desde}
      left join beta_invites b on b.id = o.beta_invite_id
      group by o.id, o.name, o.plan_id, b.label
      having count(e.id) > 0 or o.created_at >= ${desde}
      order by coalesce(sum(e.charge_brl_micros), 0) desc limit 100`),
  ]);
  const f = funil.rows[0] ?? {};
  const c = cache.rows[0] ?? {};
  return {
    dias,
    funil: { cadastros: n(f.cadastros), emailConfirmado: n(f.confirmados), primeiraResposta: n(f.responderam), respostaEm10Min: n(f.em10), assinantes: n(f.assinantes) },
    ativasNaSemana: n(semana.rows[0]?.ativas),
    cache: { entrada: n(c.entrada), lido: n(c.lido), escrito: n(c.escrito), saida: n(c.saida) },
    modelos: modelos.rows.map((r) => ({ modelId: String(r.model_id), requisicoes: n(r.requisicoes), tokens: n(r.tokens), chargeBrlMicros: n(r.cobrado), costUsdMicros: n(r.custo) })),
    clientes: clientes.rows.map((r) => ({
      orgId: String(r.id),
      nome: String(r.name),
      plano: r.plan_id ? String(r.plan_id) : null,
      convite: r.convite ? String(r.convite) : null,
      requisicoes: n(r.requisicoes),
      chargeBrlMicros: n(r.cobrado),
      costUsdMicros: n(r.custo),
      ultimoUso: r.ultimo ? new Date(r.ultimo as string).toISOString() : null,
    })),
  };
}
