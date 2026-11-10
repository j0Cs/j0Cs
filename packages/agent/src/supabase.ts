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

/** Maior migração que a Forja aplica (o resto, pelo Supabase CLI): precisa caber na revisão. */
export const MIGRACAO_MAXIMA = 100_000;

/**
 * "20261109120000_cria_tarefas.sql" → versão 20261109120000, nome cria_tarefas (padrão do CLI).
 * Sem os 14 dígitos no começo, null: a versão precisa ser estável para o histórico não repetir nada.
 */
export function versaoDaMigracao(path: string) {
  const arquivo = CAMINHO_DE_MIGRACAO.exec(path)?.[1] ?? path;
  const m = /^(\d{14})_(.+)$/.exec(arquivo);
  return m ? { versao: m[1]!, nome: m[2]! } : null;
}

/** SQL sem comentários e sem blocos $tag$...$tag$ (corpos de função), para procurar comandos soltos. */
function sqlSolto(sql: string) {
  return sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Revisão automática do SQL antes de aplicar.
 * - bloqueio: o que a Forja não aplica (controle de transação quebraria o "inteira ou nada").
 * - avisos: o que merece atenção redobrada de quem confirma.
 */
export function analisarMigracao(path: string, sql: string) {
  const avisos: string[] = [];
  if (!versaoDaMigracao(path)) {
    return { bloqueio: "O nome precisa começar com data e hora (AAAAMMDDHHMMSS_nome.sql). Peça ao agente para renomear.", avisos };
  }
  if (sql.length > MIGRACAO_MAXIMA) return { bloqueio: "Grande demais para revisar aqui (mais de 100 mil caracteres). Aplique pelo Supabase CLI.", avisos };
  const s = sqlSolto(sql).toLowerCase();
  if (/(^|;)\s*(begin|commit|rollback|end|abort|savepoint|release|start\s+transaction)\b[^;]*(;|$)/.test(s)) {
    return { bloqueio: "Tem controle de transação (begin/commit/rollback). A Forja roda cada migração numa transação só; tire esses comandos.", avisos };
  }
  const regras: [RegExp, string][] = [
    [/\bdrop\s+(table|schema|database|column|owned)\b|\btruncate\b|\bdelete\s+from\b/, "apaga dados ou estruturas (drop, truncate ou delete)"],
    [/\bdisable\s+row\s+level\s+security\b|\bno\s+force\s+row\s+level\s+security\b/, "desliga a RLS de uma tabela"],
    [/\bgrant\b[^;]*\bto\s+(anon|authenticated|public)\b/, "dá permissão a anon, authenticated ou public"],
    [/\busing\s*\(\s*true\s*\)|\bwith\s+check\s*\(\s*true\s*\)/, "política de RLS que libera para todos (true)"],
    [/\b(alter|create|drop)\s+(role|user)\b/, "mexe em papéis do banco"],
    [/\bsecurity\s+definer\b/, "função com os direitos do dono (security definer)"],
    [/\b(dblink|pg_net|http_get|http_post|net\.http_)/, "acessa a rede de dentro do banco"],
    [/\bauth\.|\bstorage\./, "mexe nos schemas do Supabase (auth ou storage)"],
  ];
  for (const [re, texto] of regras) if (re.test(s)) avisos.push(texto);
  return { bloqueio: null as string | null, avisos };
}

/** Texto entre $tag$ ... $tag$ sem chance de colidir com o conteúdo. */
export function textoSql(valor: string) {
  let tag = "forja";
  while (valor.includes(`$${tag}$`)) tag = `forja_${randomBytes(4).toString("hex")}`;
  return `$${tag}$${valor}$${tag}$`;
}

export const HISTORICO_DO_CLI = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`;

/**
 * SQL da migração + o registro no histórico, numa consulta só: o protocolo simples do Postgres roda
 * várias instruções numa transação implícita (inteira ou nada). Por isso migração com begin/commit
 * é bloqueada antes (analisarMigracao).
 */
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
