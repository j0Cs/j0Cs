import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analisarPasta, lerPasta } from "../src/pasta";
import { ferramentasValidas, gravarTime, planejarTime } from "../src/time";

async function projeto(git: boolean) {
  const raiz = await mkdtemp(path.join(os.tmpdir(), "forja-pasta-"));
  await mkdir(path.join(raiz, "src"));
  await mkdir(path.join(raiz, "node_modules", "lixo"), { recursive: true });
  await writeFile(path.join(raiz, "package.json"), JSON.stringify({ name: "demo", dependencies: { next: "16.0.0", react: "19.0.0" }, scripts: { dev: "next dev" } }));
  await writeFile(path.join(raiz, "src", "app.ts"), 'export const chave = "sk-ant-api03-' + "x9".repeat(48) + '";\n');
  await writeFile(path.join(raiz, "node_modules", "lixo", "index.js"), "module.exports = 1;\n");
  await writeFile(path.join(raiz, ".env"), "SEGREDO=1\n");
  await writeFile(path.join(raiz, "AGENTS.md"), "# Regras da casa\n\nUse pnpm.\n");
  if (git) {
    const g = (...a: string[]) => execFileSync("git", a, { cwd: raiz, stdio: "ignore" });
    g("init", "-q", "-b", "principal");
    await writeFile(path.join(raiz, ".gitignore"), "node_modules\n.env\n");
    g("add", "-A");
    g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "inicial");
  }
  return raiz;
}

describe("ler pasta", () => {
  it("num repositório git entram só os arquivos versionados", async () => {
    const raiz = await projeto(true);
    const l = await lerPasta(raiz);
    expect(l.versionada).toBe(true);
    expect([...l.arquivos.keys()].sort()).toEqual([".gitignore", "AGENTS.md", "package.json", "src/app.ts"]);
    const a = await analisarPasta(raiz);
    expect(a.estrutura.branch).toBe("principal");
    expect(a.estrutura.stack).toContain("Next.js");
    expect(a.achados.some((x) => x.arquivo === "src/app.ts" && x.categoria === "seguranca")).toBe(true);
    expect(a.achados.some((x) => x.titulo === "Arquivo de ambiente versionado")).toBe(false);
    expect(a.estrutura.configsDeIa.map((c) => c.caminho)).toContain("AGENTS.md");
  });
  it("fora do git percorre a pasta, pula dependências e não segue links", async () => {
    const raiz = await projeto(false);
    await symlink(os.tmpdir(), path.join(raiz, "atalho"));
    const l = await lerPasta(raiz);
    expect(l.versionada).toBe(false);
    expect([...l.arquivos.keys()].some((c) => c.startsWith("node_modules/") || c.startsWith("atalho/"))).toBe(false);
    expect(l.arquivos.has(".env")).toBe(true);
    const a = await analisarPasta(raiz);
    expect(a.achados.some((x) => x.titulo === "Arquivo de ambiente versionado")).toBe(false);
    expect(a.estrutura.branch).toBe("sem git");
  });
});

describe("instalar o time", () => {
  it("planeja, grava e fica em dia; AGENTS.md existente é preservado", async () => {
    const raiz = await projeto(false);
    const plano = await planejarTime(raiz, ["claude_code", "codex"]);
    expect(plano.find((p) => p.caminho === "AGENTS.md")?.estado).toBe("muda");
    expect(plano.find((p) => p.caminho === ".claude/agents/forja-dev-senior.md")?.estado).toBe("novo");
    const gravados = await gravarTime(raiz, plano);
    expect(gravados).toHaveLength(plano.length);
    const agents = await readFile(path.join(raiz, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# Regras da casa\n\nUse pnpm.")).toBe(true);
    expect(agents).toContain("forja:time:inicio");
    expect((await planejarTime(raiz, ["claude_code", "codex"])).every((p) => p.estado === "igual")).toBe(true);
    expect(await gravarTime(raiz, await planejarTime(raiz, ["claude_code", "codex"]))).toEqual([]);
  });
  it("não grava fora da pasta por link simbólico", async () => {
    const raiz = await projeto(false);
    const fora = await mkdtemp(path.join(os.tmpdir(), "forja-fora-"));
    await symlink(fora, path.join(raiz, ".claude"));
    await expect(gravarTime(raiz, await planejarTime(raiz, ["claude_code"]))).rejects.toThrow(/fora da pasta/);
    await writeFile(path.join(fora, "alvo.md"), "x");
    const raiz2 = await projeto(false);
    await symlink(path.join(fora, "alvo.md"), path.join(raiz2, "GEMINI.md"));
    await expect(gravarTime(raiz2, await planejarTime(raiz2, ["gemini_cli"]))).rejects.toThrow(/link simbólico/);
    expect(await readFile(path.join(fora, "alvo.md"), "utf8")).toBe("x");
  });
  it("só ferramentas conhecidas", () => {
    expect(ferramentasValidas(["claude_code", "x", "claude_code", 3, "__proto__"])).toEqual(["claude_code"]);
    expect(ferramentasValidas("claude_code")).toEqual([]);
  });
});
