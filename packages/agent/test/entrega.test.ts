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
    expect(versaoDaMigracao("supabase/migrations/20261109120000_cria_tarefas.sql", "x")).toEqual({ versao: "20261109120000", nome: "cria_tarefas" });
    expect(versaoDaMigracao("supabase/migrations/sem_data.sql", "20261109999999")).toEqual({ versao: "20261109999999", nome: "sem_data" });
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
