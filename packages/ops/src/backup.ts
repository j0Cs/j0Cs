/**
 * Backup diário fora do Supabase (GitHub Actions, ops/backup/*.sh): a cópia sai cifrada com `age`
 * para uma chave pública. A chave privada fica só com o dono (gerada aqui e mostrada uma vez).
 * O workflow registra o resultado em settings.backup_meta; a rotina diária alerta se falhar ou parar.
 */
import { createHash, createHmac, generateKeyPairSync, pbkdf2Sync, randomBytes } from "node:crypto";
import { eq, schema, sql, type Db } from "@forja/db";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(valores: number[]) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of valores) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk >>> 0;
}

function bits(dados: Uint8Array, de: number, para: number) {
  let acc = 0;
  let n = 0;
  const saida: number[] = [];
  const max = (1 << para) - 1;
  for (const v of dados) {
    acc = (acc << de) | v;
    n += de;
    while (n >= para) {
      n -= para;
      saida.push((acc >>> n) & max);
    }
  }
  if (n > 0) saida.push((acc << (para - n)) & max);
  return saida;
}

/** Bech32 (BIP 173), o formato das chaves do age. */
export function bech32(hrp: string, dados: Uint8Array) {
  const d = bits(dados, 8, 5);
  const expandido = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const pm = polymod([...expandido, ...d, 0, 0, 0, 0, 0, 0]) ^ 1;
  const soma = [0, 1, 2, 3, 4, 5].map((i) => (pm >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...d, ...soma].map((x) => CHARSET[x]).join("")}`;
}

/** Par de chaves X25519 no formato do age: "age1..." (pública) e "AGE-SECRET-KEY-1..." (privada). */
export function gerarChavesAge() {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const d = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { publica: bech32("age", x), privada: bech32("age-secret-key-", d).toUpperCase() };
}

export interface MetaDoBackup {
  em: Date;
  ok: boolean;
  detalhe: string;
  execucao: string | null;
  tamanhoBytes: number | null;
  tabelas: number | null;
}

export async function metaDoBackup(db: Db): Promise<MetaDoBackup | null> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "backup_meta") });
  if (!row) return null;
  const v = row.value as { em?: string; ok?: boolean; detalhe?: string; execucao?: string; tamanhoBytes?: number; tabelas?: number };
  if (!v.em) return null;
  return {
    em: new Date(v.em),
    ok: v.ok === true,
    detalhe: v.detalhe ?? "",
    execucao: v.execucao ?? null,
    tamanhoBytes: typeof v.tamanhoBytes === "number" ? v.tamanhoBytes : null,
    tabelas: typeof v.tabelas === "number" ? v.tabelas : null,
  };
}

/** Situação do backup para o alerta do dono (36 h dá folga para um atraso do agendador). */
export function situacaoDoBackup(meta: MetaDoBackup | null, agora = new Date()) {
  if (!meta) return { tipo: "nao_configurado" as const };
  if (!meta.ok) return { tipo: "falhou" as const };
  if (agora.getTime() - meta.em.getTime() > 36 * 60 * 60 * 1000) return { tipo: "atrasado" as const };
  return { tipo: "ok" as const };
}

/**
 * Verificador SCRAM-SHA-256 da senha (o formato que o Postgres guarda). O ALTER ROLE recebe o
 * verificador, nunca a senha: nem o log do banco vê a senha.
 */
export function verificadorScram(senha: string, iteracoes = 4096, sal = randomBytes(16)) {
  const salgada = pbkdf2Sync(senha.normalize("NFKC"), sal, iteracoes, 32, "sha256");
  const chaveCliente = createHmac("sha256", salgada).update("Client Key").digest();
  const armazenada = createHash("sha256").update(chaveCliente).digest();
  const chaveServidor = createHmac("sha256", salgada).update("Server Key").digest();
  return `SCRAM-SHA-256$${iteracoes}:${sal.toString("base64")}$${armazenada.toString("base64")}:${chaveServidor.toString("base64")}`;
}

export const PAPEL_DO_BACKUP = "forja_backup";

/**
 * Cria (ou renova) o papel do banco que o backup usa: lê todas as tabelas da Forja (public e
 * drizzle) e só escreve em settings (o registro do resultado). Senha nova a cada chamada (a antiga
 * para de funcionar). Devolve a URL para o secret BACKUP_DATABASE_URL do GitHub.
 */
export async function prepararAcessoDoBackup(db: Db, urlDoBanco = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL) {
  if (!urlDoBanco) throw new Error("DATABASE_URL não definida.");
  const senha = randomBytes(24).toString("base64url");
  const p = PAPEL_DO_BACKUP;
  await db.execute(sql.raw(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${p}') then create role ${p}; end if; end $$`));
  await db.execute(sql.raw(`alter role ${p} with login bypassrls nocreatedb nocreaterole password '${verificadorScram(senha)}'`));
  for (const comando of [
    `grant usage on schema public to ${p}`,
    `grant select on all tables in schema public to ${p}`,
    `grant select on all sequences in schema public to ${p}`,
    `alter default privileges in schema public grant select on tables to ${p}`,
    `alter default privileges in schema public grant select on sequences to ${p}`,
    // escrever, só pelo registro do backup: nada de mexer no câmbio ou em outra chave de settings
    `revoke insert, update, delete on public.settings from ${p}`,
    `create schema if not exists forja_interno`,
    `revoke all on schema forja_interno from public`,
    `create or replace function forja_interno.registrar_backup(dados jsonb) returns void
      language sql security definer set search_path = pg_catalog, pg_temp as $fn$
        insert into public.settings (key, value, updated_at)
        values ('backup_meta', jsonb_build_object(
          'em', now(),
          'ok', coalesce((dados->>'ok')::boolean, false),
          'detalhe', left(coalesce(dados->>'detalhe', ''), 500),
          'execucao', left(dados->>'execucao', 300),
          'tabelas', (dados->>'tabelas')::int,
          'tamanhoBytes', (dados->>'tamanhoBytes')::bigint), now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
      $fn$`,
    `revoke all on function forja_interno.registrar_backup(jsonb) from public`,
    `grant usage on schema forja_interno to ${p}`,
    `grant execute on function forja_interno.registrar_backup(jsonb) to ${p}`,
  ]) {
    await db.execute(sql.raw(comando));
  }
  // drizzle guarda o histórico das migrações (pode não existir num banco recém-criado)
  await db.execute(
    sql.raw(`do $$ begin if exists (select 1 from pg_namespace where nspname = 'drizzle') then
      execute 'grant usage on schema drizzle to ${p}';
      execute 'grant select on all tables in schema drizzle to ${p}';
      execute 'grant select on all sequences in schema drizzle to ${p}';
    end if; end $$`),
  );

  const u = new URL(urlDoBanco);
  // Supabase: o pooler identifica o projeto pelo sufixo do usuário (postgres.<ref>); a porta 5432
  // é o modo sessão, que o pg_dump precisa (o 6543 é o modo transação).
  const ref = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1];
  const banco = u.pathname.replace(/^\//, "") || "postgres";
  const destino = new URL(`postgresql://${u.host}/${banco}`);
  destino.username = ref ? `${p}.${ref}` : p;
  destino.password = senha;
  if (ref) {
    destino.port = "5432";
    // conexão sempre cifrada (sem o parâmetro, o padrão do libpq aceitaria cair para texto puro)
    destino.searchParams.set("sslmode", "require");
  }
  return { url: destino.toString(), usuario: destino.username, host: destino.hostname };
}
