import { describe, expect, it } from "vitest";
import { sqlDaMigracao, textoSql, versaoDaMigracao } from "../src/supabase";
import { detectarFramework, nomeDeProjeto } from "../src/vercel";

describe("framework da Vercel pelo package.json", () => {
  const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) => JSON.stringify({ dependencies: deps, devDependencies: dev });
  it("reconhece os frameworks comuns", () => {
    expect(detectarFramework(pkg({ next: "16", react: "19" }))).toBe("nextjs");
    expect(detectarFramework(pkg({ react: "19" }, { vite: "7" }))).toBe("vite");
    expect(detectarFramework(pkg({ astro: "5" }))).toBe("astro");
    expect(detectarFramework(pkg({}, { "@sveltejs/kit": "2", vite: "7" }))).toBe("sveltekit");
    expect(detectarFramework(pkg({ "@remix-run/react": "2" }))).toBe("remix");
    expect(detectarFramework(pkg({ nuxt: "4", vue: "3" }))).toBe("nuxtjs");
  });
  it("sem package.json ou inválido: deixa a Vercel tratar como site estático", () => {
    expect(detectarFramework(null)).toBeNull();
    expect(detectarFramework("{ isso não é json")).toBeNull();
    expect(detectarFramework(pkg({ express: "5" }))).toBeNull();
  });
});

describe("nome do projeto na Vercel", () => {
  it("minúsculas e caracteres aceitos", () => {
    expect(nomeDeProjeto("Cliente/Meu Site_Novo!")).toBe("meu-site_novo");
    expect(nomeDeProjeto("org/---")).toBe("projeto-forja");
    expect(nomeDeProjeto("org/a---b")).toBe("a--b");
  });
});

describe("migrações do Supabase", () => {
  it("versão e nome no padrão do CLI", () => {
    expect(versaoDaMigracao("supabase/migrations/20261109120000_cria_tarefas.sql")).toEqual({ versao: "20261109120000", nome: "cria_tarefas" });
    expect(versaoDaMigracao("supabase/migrations/sem_data.sql")).toBeNull();
    expect(versaoDaMigracao("supabase/migrations/0001_curta.sql")).toBeNull();
  });
  it("texto entre $tag$ não colide com o conteúdo", () => {
    expect(textoSql("abc")).toBe("$forja$abc$forja$");
    const t = textoSql("tem $forja$ no meio");
    const tag = t.slice(0, t.indexOf("$", 1) + 1);
    expect(tag).not.toBe("$forja$");
    expect(t).toBe(`${tag}tem $forja$ no meio${tag}`);
  });
  it("SQL da migração + registro no histórico numa consulta só", () => {
    const q = sqlDaMigracao({ versao: "20261109120000", nome: "cria", sql: "create table t (id int)" });
    expect(q.startsWith("create table t (id int);\ninsert into supabase_migrations.schema_migrations")).toBe(true);
    expect(q).toContain("array[$forja$create table t (id int)$forja$]");
  });
});

describe("revisão automática das migrações", () => {
  const P = "supabase/migrations/20261109120000_x.sql";
  it("bloqueia nome sem data, controle de transação e arquivo grande demais", async () => {
    const { analisarMigracao } = await import("../src/supabase");
    expect(analisarMigracao("supabase/migrations/init.sql", "create table t (id int);").bloqueio).toMatch(/data e hora/);
    expect(analisarMigracao(P, "create table t (id int);\ncommit;\ncreate table u (id int);").bloqueio).toMatch(/controle de transação/);
    expect(analisarMigracao(P, "BEGIN;\ncreate table t (id int);").bloqueio).toMatch(/controle de transação/);
    expect(analisarMigracao(P, `select '${"x".repeat(100_001)}';`).bloqueio).toMatch(/Grande demais/);
  });
  it("begin/end dentro de função e em texto não bloqueiam", async () => {
    const { analisarMigracao } = await import("../src/supabase");
    const funcao = "create function f() returns void language plpgsql as $$\nbegin\n  perform 1;\nend;\n$$;\ncomment on table t is 'commit; begin;';\n-- commit;\n";
    expect(analisarMigracao(P, funcao).bloqueio).toBeNull();
  });
  it("avisa o que merece atenção", async () => {
    const { analisarMigracao } = await import("../src/supabase");
    const r = analisarMigracao(P, "alter table t disable row level security;\ngrant select on t to anon;\ndrop table velha;\ncreate policy p on t for select using (true);");
    expect(r.bloqueio).toBeNull();
    expect(r.avisos.join(" | ")).toMatch(/desliga a RLS/);
    expect(r.avisos.join(" | ")).toMatch(/anon, authenticated ou public/);
    expect(r.avisos.join(" | ")).toMatch(/apaga dados/);
    expect(r.avisos.join(" | ")).toMatch(/libera para todos/);
    expect(analisarMigracao(P, "create table t (id int);\nalter table t enable row level security;").avisos).toEqual([]);
  });
});
