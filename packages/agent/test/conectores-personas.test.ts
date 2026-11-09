import { describe, expect, it } from "vitest";
import { CONECTORES, verificarConector } from "../src/conectores";
import { arquivosDoTime, instrucoesDoTime, mesclarBloco, personasValidas } from "../src/personas";
import { diffDoPR, markdownDaRevisao } from "../src/tarefas";

/** fetch falso: guarda o pedido e devolve a resposta escolhida. */
function falso(status: number, corpo: unknown) {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    pedidos.push({ url: String(url), init });
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, pedidos };
}
const cabecalho = (init: RequestInit | undefined, nome: string) => new Headers(init?.headers).get(nome);

describe("catálogo de conectores", () => {
  it("todo conector disponível com formulário tem rótulo e dica; tipos únicos", () => {
    const tipos = CONECTORES.map((c) => c.type);
    expect(new Set(tipos).size).toBe(tipos.length);
    for (const c of CONECTORES.filter((c) => c.available && !c.href)) {
      expect(c.credentialLabel, c.type).not.toBe("");
      expect(c.credentialHint, c.type).not.toBe("");
    }
  });

  it("GitLab: token no PRIVATE-TOKEN e GitLab próprio pelo endereço", async () => {
    const { f, pedidos } = falso(200, { username: "maria" });
    expect(await verificarConector("gitlab", "glpat-abc", f)).toMatchObject({ ok: true, account: "maria" });
    expect(pedidos[0]!.url).toBe("https://gitlab.com/api/v4/user");
    expect(cabecalho(pedidos[0]!.init, "PRIVATE-TOKEN")).toBe("glpat-abc");
    const r = await verificarConector("gitlab", "https://git.empresa.com.br glpat-xyz", f);
    expect(r.metadata).toEqual({ baseUrl: "https://git.empresa.com.br" });
    expect(pedidos[1]!.url).toBe("https://git.empresa.com.br/api/v4/user");
  });

  it("Bitbucket exige e-mail:token e manda Basic", async () => {
    const { f, pedidos } = falso(200, { display_name: "Ana" });
    expect((await verificarConector("bitbucket", "sem-dois-pontos", f)).ok).toBe(false);
    expect(await verificarConector("bitbucket", "ana@x.com:tok", f)).toMatchObject({ ok: true, account: "Ana" });
    expect(cabecalho(pedidos[0]!.init, "authorization")).toBe(`Basic ${Buffer.from("ana@x.com:tok").toString("base64")}`);
  });

  it("credencial recusada vira mensagem clara", async () => {
    const { f } = falso(401, { message: "unauthorized" });
    expect(await verificarConector("netlify", "x", f)).toEqual({ ok: false, error: "A Netlify recusou a credencial (401)." });
  });

  it("Cloudflare só aceita token ativo; Fly usa o token FlyV1 como veio", async () => {
    expect((await verificarConector("cloudflare", "t", falso(200, { result: { status: "disabled" } }).f)).ok).toBe(false);
    expect((await verificarConector("cloudflare", "t", falso(200, { result: { status: "active" } }).f)).ok).toBe(true);
    const { f, pedidos } = falso(200, { data: { viewer: { email: "ops@x.com" } } });
    expect(await verificarConector("flyio", "FlyV1 fm2_abc", f)).toMatchObject({ ok: true, account: "ops@x.com" });
    expect(cabecalho(pedidos[0]!.init, "authorization")).toBe("FlyV1 fm2_abc");
  });

  it("Railway sem `me` (token de time) e PlanetScale sem id:token são recusados", async () => {
    expect((await verificarConector("railway", "t", falso(200, { data: { me: null } }).f)).ok).toBe(false);
    expect((await verificarConector("planetscale", "so-token", falso(200, {}).f)).error).toMatch(/id:token/);
  });

  it("Anthropic exige Admin key (não a chave comum)", async () => {
    expect((await verificarConector("anthropic_admin", "sk-ant-api03-xyz", falso(200, {}).f)).error).toMatch(/Admin key/);
    const { f, pedidos } = falso(200, { name: "Minha org" });
    expect(await verificarConector("anthropic_admin", "sk-ant-admin01-xyz", f)).toMatchObject({ ok: true, account: "Minha org" });
    expect(cabecalho(pedidos[0]!.init, "x-api-key")).toBe("sk-ant-admin01-xyz");
  });

  it("redirecionamento não é seguido (nem vira sucesso)", async () => {
    const pedidos: RequestInit[] = [];
    const f = (async (_: string, init?: RequestInit) => {
      pedidos.push(init ?? {});
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    }) as unknown as typeof fetch;
    const r = await verificarConector("gitlab", "https://git.exemplo.com.br glpat-x", f);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/redirecionamento/);
    expect(pedidos[0]!.redirect).toBe("manual");
  });

  it("tipo desconhecido não chama a rede", async () => {
    const { f, pedidos } = falso(200, {});
    expect((await verificarConector("firebase", "x", f)).ok).toBe(false);
    expect(pedidos).toHaveLength(0);
  });
});

describe("time da Forja", () => {
  it("personasValidas filtra, ordena e usa o padrão quando vazio", () => {
    expect(personasValidas(["qa_pleno", "x", "dev_senior", "qa_pleno"], ["dev_pleno"])).toEqual(["dev_senior", "qa_pleno"]);
    expect(personasValidas([], ["dev_pleno"])).toEqual(["dev_pleno"]);
    expect(personasValidas("dev_senior", ["dev_pleno"])).toEqual(["dev_pleno"]);
  });

  it("instruções do time citam só os papéis escolhidos", () => {
    const t = instrucoesDoTime(["qa_pleno"]);
    expect(t).toContain("# QA Pleno — Forja");
    expect(t).not.toContain("# Dev Sênior — Forja");
    expect(t).toContain("registrar_achado");
  });

  it("mesclarBloco: cria, acrescenta preservando e troca o bloco antigo sem duplicar", () => {
    const bloco = "<!-- forja:time:inicio -->\nnovo\n<!-- forja:time:fim -->";
    expect(mesclarBloco(null, bloco)).toBe(`${bloco}\n`);
    const com = mesclarBloco("# Projeto\n\nRegras.\n", bloco);
    expect(com).toBe(`# Projeto\n\nRegras.\n\n${bloco}\n`);
    const velho = "# P\n\n<!-- forja:time:inicio -->\nantigo\n<!-- forja:time:fim -->\n\nDepois.\n";
    const trocado = mesclarBloco(velho, bloco);
    expect(trocado).toBe(`# P\n\n${bloco}\n\nDepois.\n`);
    expect(mesclarBloco(trocado, bloco)).toBe(trocado);
  });

  it("arquivos por ferramenta: só o que foi escolhido", () => {
    const soClaude = arquivosDoTime(["claude_code"]).map((a) => a.path);
    expect(soClaude).toContain(".claude/agents/forja-dev-senior.md");
    expect(soClaude.some((p) => p.startsWith(".forja/") || p === "AGENTS.md")).toBe(false);
    const grok = arquivosDoTime(["grok_build"]);
    expect(grok.find((a) => a.path === "AGENTS.md")?.bloco).toBe(true);
    expect(grok.some((a) => a.path === "GEMINI.md")).toBe(false);
  });

  it("frontmatter dos subagentes é YAML de uma linha por campo", () => {
    for (const a of arquivosDoTime(["claude_code"]).filter((x) => x.path.startsWith(".claude/agents/"))) {
      const [, fm] = a.content.split("---\n");
      for (const linha of fm!.trim().split("\n")) {
        expect(linha, a.path).toMatch(/^(name|description|tools|model): \S/);
        const valor = linha.slice(linha.indexOf(": ") + 2);
        // texto livre vai entre aspas (": " dentro dele quebraria o YAML); o resto não tem ": "
        if (linha.startsWith("description: ")) expect(typeof JSON.parse(valor)).toBe("string");
        else expect(valor, a.path).not.toContain(": ");
      }
    }
  });

  it("TOML dos comandos do Gemini: texto multilinha fechado e sem aspas triplas soltas", () => {
    const toml = arquivosDoTime(["gemini_cli"]).find((a) => a.path.endsWith("auditoria.toml"))!.content;
    expect(toml).toMatch(/^description = ".+"\nprompt = """\n[\s\S]+\n"""\n$/);
    expect(toml.match(/"""/g)).toHaveLength(2);
    expect(toml).toContain("{{args}}");
  });
});

describe("revisão de PR", () => {
  it("diff grande é cortado com a lista do que ficou de fora", () => {
    const grande = "x".repeat(40_000);
    const d = diffDoPR([
      { arquivo: "a.ts", status: "modified", adicoes: 1, remocoes: 0, patch: "+a" },
      { arquivo: "b.ts", status: "added", adicoes: 1, remocoes: 0, patch: grande },
      { arquivo: "c.ts", status: "added", adicoes: 1, remocoes: 0, patch: grande },
      { arquivo: "img.png", status: "added", adicoes: 0, remocoes: 0, patch: null },
    ]);
    expect(d).toContain("--- a.ts\n+a");
    expect(d).toContain("--- img.png\n(sem diff de texto");
    expect(d).toMatch(/1 arquivo\(s\) ficaram de fora.*c\.ts/);
    expect(d.length).toBeLessThan(61_000);
  });

  it("markdown da revisão: veredito, ordem por severidade e sem menções", () => {
    const md = markdownDaRevisao(
      {
        veredito: "seguir_com_ajustes",
        achados: [
          { categoria: "qualidade", severidade: "baixa", titulo: "Nome confuso", detalhe: "d", recomendacao: "r", origem: "agente", persona: "dev_pleno" },
          { categoria: "seguranca", severidade: "alta", titulo: "XSS para @fulano", detalhe: "d", arquivo: "a.tsx", linha: 3, recomendacao: "r", origem: "agente", persona: "seguranca_pleno" },
        ],
        pareceres: [{ persona: "qa_pleno", parecer: "ok" }],
      },
      "Resumo.",
    );
    expect(md.startsWith("## Revisão de QA da Forja: Seguir com ajustes")).toBe(true);
    expect(md.indexOf("XSS")).toBeLessThan(md.indexOf("Nome confuso"));
    expect(md).toContain("`a.tsx:3` · Cyber Security Pleno");
    expect(md).not.toMatch(/@fulano/);
  });
});
