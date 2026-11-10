/**
 * Estrutura de um repositório (sem modelo de IA, sem custo): linguagens, stack, scripts, arquivos de
 * configuração de assistentes de IA, árvore resumida e o começo do README. Lida do tarball do GitHub.
 */
import { extrairTarGz } from "./workspace";
import type { GithubApp } from "./github";

export interface EstruturaDoRepositorio {
  repo: string;
  branch: string;
  sha: string | null;
  lidoEm: string;
  arquivos: number;
  bytes: number;
  linguagens: { nome: string; arquivos: number; bytes: number }[];
  stack: string[];
  scripts: Record<string, string>;
  /** CLAUDE.md, AGENTS.md, GEMINI.md…: entram no contexto de toda sessão do assistente. */
  configsDeIa: { caminho: string; bytes: number; tokensAprox: number }[];
  arvore: { caminho: string; tipo: "pasta" | "arquivo"; arquivos: number; bytes: number }[];
  readme: string | null;
  avisos: string[];
}

const IGNORADAS = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|vendor|coverage|\.turbo|\.vercel|__pycache__|\.venv|venv|target)\//;

const LINGUAGENS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", swift: "Swift", dart: "Dart", scala: "Scala", ex: "Elixir", exs: "Elixir", c: "C", h: "C",
  cpp: "C++", cc: "C++", hpp: "C++", sql: "SQL", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS",
  html: "HTML", vue: "Vue", svelte: "Svelte", astro: "Astro", sh: "Shell", bash: "Shell",
};

/** Dependência do package.json → nome na stack. */
const PACOTES: [RegExp, string][] = [
  [/^next$/, "Next.js"], [/^react$/, "React"], [/^vue$/, "Vue"], [/^nuxt$/, "Nuxt"], [/^@sveltejs\/kit$/, "SvelteKit"],
  [/^svelte$/, "Svelte"], [/^astro$/, "Astro"], [/^@remix-run\//, "Remix"], [/^@angular\/core$/, "Angular"], [/^vite$/, "Vite"],
  [/^express$/, "Express"], [/^fastify$/, "Fastify"], [/^@nestjs\/core$/, "NestJS"], [/^hono$/, "Hono"],
  [/^(prisma|@prisma\/client)$/, "Prisma"], [/^drizzle-orm$/, "Drizzle"], [/^@supabase\/supabase-js$/, "Supabase"],
  [/^firebase(-admin)?$/, "Firebase"], [/^mongoose$|^mongodb$/, "MongoDB"], [/^pg$|^postgres$/, "PostgreSQL"],
  [/^mysql2?$/, "MySQL"], [/^redis$|^ioredis$/, "Redis"], [/^tailwindcss$/, "Tailwind CSS"], [/^stripe$/, "Stripe"],
  [/^@anthropic-ai\/sdk$/, "Claude API"], [/^openai$/, "OpenAI API"], [/^@google\/(genai|generative-ai)$/, "Gemini API"],
  [/^ai$/, "Vercel AI SDK"], [/^langchain$|^@langchain\//, "LangChain"], [/^better-auth$/, "Better Auth"],
  [/^next-auth$|^@auth\//, "Auth.js"], [/^@clerk\//, "Clerk"], [/^vitest$/, "Vitest"], [/^jest$/, "Jest"],
  [/^@playwright\/test$|^playwright$/, "Playwright"], [/^cypress$/, "Cypress"], [/^typescript$/, "TypeScript"],
];

const PYTHON: [RegExp, string][] = [
  [/^django\b/i, "Django"], [/^fastapi\b/i, "FastAPI"], [/^flask\b/i, "Flask"], [/^anthropic\b/i, "Claude API"],
  [/^openai\b/i, "OpenAI API"], [/^google-genai\b/i, "Gemini API"], [/^langchain/i, "LangChain"], [/^sqlalchemy\b/i, "SQLAlchemy"],
  [/^pytest\b/i, "pytest"],
];

/** Arquivos que os assistentes de IA carregam em toda sessão (o tamanho vira custo em cada conversa). */
export const CONFIGS_DE_IA = /^(CLAUDE\.md|CLAUDE\.local\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.claude\/settings(\.local)?\.json|\.mcp\.json|\.cursor\/rules\/.+|\.claude\/(agents|commands|skills)\/.+|[^/]+\/(CLAUDE|AGENTS|GEMINI)\.md)$/;

export const tokensAprox = (bytes: number) => Math.ceil(bytes / 4);

function lerJson(b: Buffer | undefined) {
  if (!b) return null;
  try {
    return JSON.parse(b.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function analisarEstrutura(
  arquivos: Map<string, Buffer>,
  grandes: Set<string>,
  meta: { repo: string; branch: string; sha: string | null },
): EstruturaDoRepositorio {
  const caminhos = [...arquivos.keys(), ...grandes].filter((c) => !IGNORADAS.test(c)).sort();
  const tamanho = (c: string) => arquivos.get(c)?.length ?? 1_000_001;
  let bytes = 0;
  const porLinguagem = new Map<string, { arquivos: number; bytes: number }>();
  for (const c of caminhos) {
    const t = tamanho(c);
    bytes += t;
    const ext = c.split(".").pop()?.toLowerCase() ?? "";
    const nome = c.includes(".") ? LINGUAGENS[ext] : undefined;
    if (nome) {
      const l = porLinguagem.get(nome) ?? { arquivos: 0, bytes: 0 };
      l.arquivos++;
      l.bytes += t;
      porLinguagem.set(nome, l);
    }
  }

  // stack: package.json da raiz e dos workspaces (apps/*, packages/*), Python e arquivos marcantes
  const stack = new Set<string>();
  let scripts: Record<string, string> = {};
  for (const c of caminhos.filter((x) => /(^|\/)package\.json$/.test(x) && x.split("/").length <= 3)) {
    const pkg = lerJson(arquivos.get(c));
    if (!pkg) continue;
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) };
    for (const d of Object.keys(deps)) for (const [re, nome] of PACOTES) if (re.test(d)) stack.add(nome);
    if (c === "package.json" && pkg.scripts && typeof pkg.scripts === "object") {
      scripts = Object.fromEntries(Object.entries(pkg.scripts as Record<string, unknown>).slice(0, 15).map(([k, v]) => [k, String(v).slice(0, 200)]));
    }
  }
  for (const c of caminhos.filter((x) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(x))) {
    for (const linha of (arquivos.get(c)?.toString("utf8") ?? "").split("\n")) {
      const dep = linha.trim().replace(/^["']/, "");
      for (const [re, nome] of PYTHON) if (re.test(dep)) stack.add(nome);
    }
  }
  const tem = (re: RegExp) => caminhos.some((c) => re.test(c));
  if (tem(/(^|\/)Dockerfile$/)) stack.add("Docker");
  if (tem(/(^|\/)(docker-)?compose\.ya?ml$/)) stack.add("Docker Compose");
  if (tem(/^vercel\.json$|\/vercel\.json$/)) stack.add("Vercel");
  if (tem(/(^|\/)netlify\.toml$/)) stack.add("Netlify");
  if (tem(/(^|\/)wrangler\.(toml|jsonc?)$/)) stack.add("Cloudflare Workers");
  if (tem(/(^|\/)fly\.toml$/)) stack.add("Fly.io");
  if (tem(/(^|\/)render\.yaml$/)) stack.add("Render");
  if (tem(/(^|\/)railway\.(json|toml)$/)) stack.add("Railway");
  if (tem(/^supabase\/(config\.toml|migrations\/)/)) stack.add("Supabase CLI");
  if (tem(/(^|\/)schema\.prisma$/)) stack.add("Prisma");
  if (tem(/^\.github\/workflows\//)) stack.add("GitHub Actions");
  if (tem(/^go\.mod$/)) stack.add("Go modules");
  if (tem(/^Cargo\.toml$/)) stack.add("Cargo");
  if (tem(/^(pnpm-workspace\.yaml|turbo\.json|nx\.json|lerna\.json)$/)) stack.add("Monorepo");

  const configsDeIa = caminhos
    .filter((c) => CONFIGS_DE_IA.test(c))
    .map((c) => ({ caminho: c, bytes: tamanho(c), tokensAprox: tokensAprox(tamanho(c)) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 30);

  // árvore: pastas e arquivos de 1º nível e as pastas de 2º nível, com quantidade e tamanho
  const nos = new Map<string, { tipo: "pasta" | "arquivo"; arquivos: number; bytes: number }>();
  for (const c of caminhos) {
    const partes = c.split("/");
    const t = tamanho(c);
    for (let n = 1; n <= Math.min(2, partes.length); n++) {
      const chave = partes.slice(0, n).join("/");
      const tipo = n < partes.length ? "pasta" : "arquivo";
      if (tipo === "arquivo" && n === 2) continue; // arquivos só na raiz
      const no = nos.get(chave) ?? { tipo, arquivos: 0, bytes: 0 };
      no.arquivos++;
      no.bytes += t;
      nos.set(chave, no);
    }
  }
  const arvore = [...nos.entries()]
    .map(([caminho, n]) => ({ caminho, ...n }))
    .sort((a, b) => a.caminho.localeCompare(b.caminho))
    .slice(0, 200);

  const readmeCaminho = caminhos.find((c) => /^readme(\.md|\.markdown|\.txt)?$/i.test(c));
  const readme = readmeCaminho ? (arquivos.get(readmeCaminho)?.toString("utf8").slice(0, 2_500) ?? null) : null;

  const avisos: string[] = [];
  const envs = caminhos.filter((c) => /(^|\/)\.env(\.[^/]*)?$/.test(c) && !/\.(example|sample|template|dist)$/i.test(c));
  if (envs.length) avisos.push(`Arquivo de variáveis de ambiente no repositório: ${envs.slice(0, 3).join(", ")}. Pode ter segredos.`);
  if (!readmeCaminho) avisos.push("Sem README na raiz.");
  if (!caminhos.includes(".gitignore")) avisos.push("Sem .gitignore na raiz.");
  if (caminhos.includes("package.json") && !caminhos.some((c) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(c))) {
    avisos.push("package.json sem arquivo de lock: as instalações podem trazer versões diferentes.");
  }
  if (!caminhos.some((c) => /(\.|_)(test|spec)\.[a-z]+$|(^|\/)(tests?|__tests__|e2e)\//.test(c))) avisos.push("Nenhum teste automatizado encontrado.");
  const configsGrandes = configsDeIa.filter((c) => /\.md$|rules/.test(c.caminho) && c.tokensAprox > 2_000);
  if (configsGrandes.length) {
    avisos.push(`Instruções de assistente de IA longas (${configsGrandes.map((c) => `${c.caminho} ≈ ${c.tokensAprox.toLocaleString("pt-BR")} tokens`).join(", ")}): entram em toda sessão e custam a cada conversa.`);
  }
  if (grandes.size) avisos.push(`${grandes.size} arquivo(s) acima de 1 MB no repositório.`);

  return {
    repo: meta.repo,
    branch: meta.branch,
    sha: meta.sha,
    lidoEm: new Date().toISOString(),
    arquivos: caminhos.length,
    bytes,
    linguagens: [...porLinguagem.entries()]
      .map(([nome, l]) => ({ nome, ...l }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 8),
    stack: [...stack].sort(),
    scripts,
    configsDeIa,
    arvore,
    readme,
    avisos,
  };
}

/** Lê a estrutura do repositório na ponta da branch padrão. */
export async function lerEstrutura(gh: GithubApp, installationId: number, fullName: string) {
  const repo = await gh.repo(installationId, fullName);
  const sha = await gh.shaDaBranch(installationId, repo.fullName, repo.defaultBranch);
  if (!sha) return analisarEstrutura(new Map(), new Set(), { repo: repo.fullName, branch: repo.defaultBranch, sha: null });
  const { arquivos, grandes } = extrairTarGz(await gh.tarball(installationId, repo.fullName, sha));
  return analisarEstrutura(arquivos, grandes, { repo: repo.fullName, branch: repo.defaultBranch, sha });
}
