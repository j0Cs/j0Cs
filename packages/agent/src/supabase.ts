/**
 * Management API do Supabase do cliente (token de acesso em Conectores): listar e criar projetos
 * e rodar as migrações que o agente escreveu. SUPABASE_API_BASE troca o endereço (testes).
 *
 * O endpoint de migrações da Management API é liberado só para alguns parceiros; por isso o SQL
 * roda por /database/query e a Forja grava o histórico no mesmo lugar que o Supabase CLI
 * (supabase_migrations.schema_migrations): um `supabase db push` depois não repete nada.
 */
import { randomBytes } from "node:crypto";

export class ErroSupabase extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ProjetoSupabase {
  ref: string;
  nome: string;
  regiao: string;
  status: string;
  organizacao: string;
}

/** Região padrão: São Paulo (clientes no Brasil). */
export const REGIAO_PADRAO = "sa-east-1";

export const CAMINHO_DE_MIGRACAO = /^supabase\/migrations\/([^/]+)\.sql$/;

/** "20261109120000_cria_tarefas.sql" → versão 20261109120000, nome cria_tarefas (padrão do CLI). */
export function versaoDaMigracao(path: string, reserva: string) {
  const arquivo = CAMINHO_DE_MIGRACAO.exec(path)?.[1] ?? path;
  const m = /^(\d{8,})_(.+)$/.exec(arquivo);
  return m ? { versao: m[1]!, nome: m[2]! } : { versao: reserva, nome: arquivo };
}

/** Texto entre $tag$ ... $tag$ sem chance de colidir com o conteúdo. */
export function textoSql(valor: string) {
  let tag = "forja";
  while (valor.includes(`$${tag}$`)) tag = `forja_${randomBytes(4).toString("hex")}`;
  return `$${tag}$${valor}$${tag}$`;
}

export const HISTORICO_DO_CLI = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`;

/** SQL da migração + o registro no histórico, numa consulta só (roda inteira ou nada). */
export function sqlDaMigracao(m: { versao: string; nome: string; sql: string }) {
  return `${m.sql.trim().replace(/;?\s*$/, ";")}
insert into supabase_migrations.schema_migrations (version, name, statements) values (${textoSql(m.versao)}, ${textoSql(m.nome)}, array[${textoSql(m.sql)}]);`;
}

const normalizar = (p: { id?: string; ref?: string; name: string; region?: string; status?: string; organization_id?: string; organization_slug?: string }) => ({
  ref: p.ref ?? p.id ?? "",
  nome: p.name,
  regiao: p.region ?? "",
  status: p.status ?? "",
  organizacao: p.organization_slug ?? p.organization_id ?? "",
});

export class SupabaseApi {
  readonly base: string;
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = (process.env.SUPABASE_API_BASE || "https://api.supabase.com").replace(/\/+$/, "");
  }

  private async req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await this.fetchImpl(`${this.base}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${this.token}`, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string | { message?: string } };
      const msg = j.message ?? (typeof j.error === "string" ? j.error : j.error?.message) ?? `Supabase respondeu ${r.status}`;
      throw new ErroSupabase(r.status, msg);
    }
    const texto = await r.text();
    return (texto ? JSON.parse(texto) : null) as T;
  }

  async organizacoes() {
    const r = await this.req<{ id: string; slug?: string; name: string }[]>("GET", "/v1/organizations");
    return r.map((o) => ({ slug: o.slug ?? o.id, nome: o.name }));
  }

  async projetos(): Promise<ProjetoSupabase[]> {
    const r = await this.req<Parameters<typeof normalizar>[0][]>("GET", "/v1/projects");
    return r.map(normalizar);
  }

  async projeto(ref: string): Promise<ProjetoSupabase> {
    return normalizar(await this.req<Parameters<typeof normalizar>[0]>("GET", `/v1/projects/${encodeURIComponent(ref)}`));
  }

  /** Cria o projeto (fica "COMING_UP" por 1 a 2 minutos). A senha do banco é gerada aqui. */
  async criarProjeto(p: { nome: string; organizacao: string; regiao?: string }) {
    const senha = randomBytes(24).toString("base64url");
    const regiao = p.regiao ?? REGIAO_PADRAO;
    let criado: Parameters<typeof normalizar>[0];
    try {
      criado = await this.req("POST", "/v1/projects", {
        name: p.nome,
        organization_slug: p.organizacao,
        db_pass: senha,
        region_selection: { type: "specific", code: regiao },
      });
    } catch (e) {
      // formato antigo da API (organization_id + region)
      if (!(e instanceof ErroSupabase) || (e.status !== 400 && e.status !== 422)) throw e;
      criado = await this.req("POST", "/v1/projects", { name: p.nome, organization_id: p.organizacao, db_pass: senha, region: regiao });
    }
    return { projeto: normalizar(criado), senha };
  }

  async sql<T = Record<string, unknown>>(ref: string, query: string) {
    return (await this.req<T[] | null>("POST", `/v1/projects/${encodeURIComponent(ref)}/database/query`, { query })) ?? [];
  }

  async versoesAplicadas(ref: string) {
    await this.sql(ref, HISTORICO_DO_CLI);
    const linhas = await this.sql<{ version: string }>(ref, "select version from supabase_migrations.schema_migrations");
    return new Set(linhas.map((l) => l.version));
  }
}
