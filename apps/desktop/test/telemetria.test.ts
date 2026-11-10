import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { arquivoDe, gravarConfig, lerConfig, mesclar, situacaoDe, tokenValido } from "../src/telemetria";

const BASE = "https://app.forja.dev";
const TOKEN = "fj_otlp_" + "A1b2C3d4".repeat(4);
const ok = (m: ReturnType<typeof mesclar>) => {
  if ("erro" in m) throw new Error(m.erro);
  return m;
};

describe("Claude Code (settings.json)", () => {
  it("arquivo novo recebe só o bloco env", () => {
    const m = ok(mesclar("claude_code", null, BASE, TOKEN));
    const j = JSON.parse(m.texto);
    expect(j.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT).toBe(`${BASE}/api/otlp/v1/logs`);
    expect(j.env.OTEL_EXPORTER_OTLP_HEADERS).toBe(`Authorization=Bearer ${TOKEN}`);
    expect(m.mudancas).toHaveLength(6);
  });
  it("preserva o resto do arquivo e as outras variáveis", () => {
    const atual = JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, env: { MINHA: "1", OTEL_LOGS_EXPORTER: "console" }, model: "opus" });
    const j = JSON.parse(ok(mesclar("claude_code", atual, BASE, TOKEN)).texto);
    expect(j.permissions.allow).toEqual(["Bash(npm test)"]);
    expect(j.model).toBe("opus");
    expect(j.env.MINHA).toBe("1");
    expect(j.env.OTEL_LOGS_EXPORTER).toBe("otlp");
    expect(Object.keys(j)).toEqual(["permissions", "env", "model"]);
  });
  it("a prévia não mostra o token inteiro", () => {
    const m = ok(mesclar("claude_code", null, BASE, TOKEN));
    expect(m.mudancas.join("\n")).not.toContain(TOKEN);
    expect(m.mudancas.join("\n")).toContain("fj_otlp_A1b2…");
  });
  it("aplicar duas vezes não muda nada", () => {
    const primeiro = ok(mesclar("claude_code", null, BASE, TOKEN)).texto;
    const segundo = ok(mesclar("claude_code", primeiro, BASE, TOKEN));
    expect(segundo.mudancas).toEqual([]);
    expect(segundo.texto).toBe(primeiro);
  });
  it("não toca em arquivo que não é JSON válido", () => {
    expect(mesclar("claude_code", '{ "env": { // comentário\n } }', BASE, TOKEN)).toHaveProperty("erro");
    expect(mesclar("claude_code", "[1,2]", BASE, TOKEN)).toHaveProperty("erro");
    expect(mesclar("claude_code", '{"env":"texto"}', BASE, TOKEN)).toHaveProperty("erro");
  });
  it("situação", () => {
    expect(situacaoDe("claude_code", null, BASE).situacao).toBe("nao_configurada");
    expect(situacaoDe("claude_code", '{"model":"opus"}', BASE).situacao).toBe("nao_configurada");
    expect(situacaoDe("claude_code", ok(mesclar("claude_code", null, BASE, TOKEN)).texto, BASE).situacao).toBe("forja");
    expect(situacaoDe("claude_code", '{"env":{"OTEL_EXPORTER_OTLP_ENDPOINT":"https://otel.empresa.com"}}', BASE).situacao).toBe("outro");
    expect(situacaoDe("claude_code", "{ quebrado", BASE)).toEqual({ situacao: "nao_configurada", ilegivel: true });
  });
});

describe("Gemini CLI (settings.json)", () => {
  it("junta telemetry sem ligar o envio de prompts", () => {
    const j = JSON.parse(ok(mesclar("gemini_cli", '{"theme":"Dracula","telemetry":{"logPrompts":true}}', BASE, TOKEN)).texto);
    expect(j.theme).toBe("Dracula");
    expect(j.telemetry.logPrompts).toBe(false);
    expect(j.telemetry.otlpEndpoint).toBe(`${BASE}/api/otlp`);
    expect(situacaoDe("gemini_cli", JSON.stringify(j), BASE).situacao).toBe("forja");
    expect(situacaoDe("gemini_cli", '{"telemetry":{"enabled":true,"otlpEndpoint":"http://localhost:4317"}}', BASE).situacao).toBe("outro");
  });
});

describe("Codex (config.toml)", () => {
  it("acrescenta [otel] no fim, preservando o resto", () => {
    const atual = 'model = "gpt-5"\n\n[mcp_servers.docs]\ncommand = "npx"\n';
    const m = ok(mesclar("codex", atual, BASE, TOKEN));
    expect(m.texto.startsWith(atual.trimEnd())).toBe(true);
    expect(m.texto).toContain("[otel]");
    expect(m.texto).toContain("log_user_prompt = false");
    expect(m.texto).toContain(`${BASE}/api/otlp/v1/logs`);
  });
  it("troca só a seção [otel] existente (com subtabelas) e mantém o que vem depois", () => {
    const atual = 'model = "gpt-5"\n\n[otel]\nenvironment = "dev"\nlog_user_prompt = true\n\n[otel.exporter.otlp-http]\nendpoint = "https://outro"\n\n[profiles.rapido]\nmodel = "gpt-5-mini"\n';
    const m = ok(mesclar("codex", atual, BASE, TOKEN));
    expect(m.texto).not.toContain("https://outro");
    expect(m.texto).not.toContain("log_user_prompt = true");
    expect(m.texto.match(/\[otel\]/g)).toHaveLength(1);
    expect(m.texto).toContain('[profiles.rapido]\nmodel = "gpt-5-mini"');
    expect(m.texto.startsWith('model = "gpt-5"\n\n[otel]')).toBe(true);
    expect(situacaoDe("codex", atual, BASE).situacao).toBe("outro");
    expect(situacaoDe("codex", m.texto, BASE).situacao).toBe("forja");
  });
  it("aplicar duas vezes não muda nada", () => {
    const primeiro = ok(mesclar("codex", 'model = "gpt-5"\n', BASE, TOKEN)).texto;
    expect(ok(mesclar("codex", primeiro, BASE, TOKEN))).toEqual({ texto: primeiro, mudancas: [] });
  });
  it("não mexe quando otel vem como chave pontilhada", () => {
    expect(mesclar("codex", 'otel.environment = "x"\n', BASE, TOKEN)).toHaveProperty("erro");
  });
  it("[otelemetria] não é a seção otel", () => {
    expect(situacaoDe("codex", "[otelemetria]\na = 1\n", BASE).situacao).toBe("nao_configurada");
  });
});

describe("token e gravação", () => {
  it("só aceita o formato do token de envio", () => {
    expect(tokenValido(TOKEN)).toBe(true);
    for (const t of ["", "fj_otlp_curto", `${TOKEN}"\n[x]`, `sk-ant-${"a".repeat(40)}`, 42, null]) expect(tokenValido(t)).toBe(false);
  });
  it("grava com cópia do anterior e por dentro de link simbólico", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "forja-tel-"));
    const arquivo = arquivoDe("claude_code", home);
    expect(await gravarConfig(arquivo, '{"a":1}\n')).toBeNull();
    const copia = await gravarConfig(arquivo, '{"a":2}\n');
    expect(copia).toBe(`${arquivo}.forja-backup`);
    expect(await readFile(copia!, "utf8")).toBe('{"a":1}\n');
    expect(await lerConfig(arquivo)).toBe('{"a":2}\n');

    const real = path.join(home, "dotfiles-gemini.json");
    await writeFile(real, '{"theme":"x"}');
    const link = arquivoDe("gemini_cli", home);
    await gravarConfig(path.join(home, ".gemini", "x"), "");
    await symlink(real, link);
    await gravarConfig(link, '{"theme":"y"}');
    expect(await readFile(real, "utf8")).toBe('{"theme":"y"}');
  });
});
