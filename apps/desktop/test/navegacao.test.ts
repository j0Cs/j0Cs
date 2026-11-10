import { describe, expect, it } from "vitest";
import { urlBase, urlValida } from "../src/config";
import { destinoDe, lerLink, linkNosArgumentos } from "../src/navegacao";

const BASE = "https://app.forja.dev";
const ESTADO = "a".repeat(43);
const CODIGO = "c".repeat(40);

describe("destinoDe", () => {
  it("só a origem do app fica na janela", () => {
    expect(destinoDe(`${BASE}/central`, BASE)).toBe("app");
    expect(destinoDe("https://app.forja.dev.evil.com/central", BASE)).toBe("navegador");
    expect(destinoDe("https://evil.com/?x=https://app.forja.dev", BASE)).toBe("navegador");
    expect(destinoDe("http://app.forja.dev/central", BASE)).toBe("barrar");
    expect(destinoDe("https://app.forja.dev:8443/", BASE)).toBe("navegador");
  });
  it("barra o que não é https nem e-mail", () => {
    for (const u of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,oi", "smb://servidor/pasta", "nada", ""]) expect(destinoDe(u, BASE)).toBe("barrar");
    expect(destinoDe("mailto:oi@forja.dev", BASE)).toBe("navegador");
  });
  it("o login da Vercel só entra na janela quando o app está num vercel.app", () => {
    expect(destinoDe("https://vercel.com/sso-api?x=1", "https://forja-web.vercel.app")).toBe("app");
    expect(destinoDe("https://vercel.com/login", BASE)).toBe("navegador");
    expect(destinoDe("https://evil.vercel.com/", "https://forja-web.vercel.app")).toBe("navegador");
  });
});

describe("lerLink", () => {
  it("aceita a volta do login", () => {
    expect(lerLink(`forja://entrar?codigo=${CODIGO}&estado=${ESTADO}`)).toEqual({ tipo: "entrar", codigo: CODIGO, estado: ESTADO });
  });
  it("recusa código ou estado fora do formato", () => {
    expect(lerLink(`forja://entrar?codigo=curto&estado=${ESTADO}`)).toBeNull();
    expect(lerLink(`forja://entrar?codigo=${CODIGO}&estado=curto`)).toBeNull();
    expect(lerLink(`forja://entrar?codigo=${CODIGO}%2F..&estado=${ESTADO}`)).toBeNull();
    expect(lerLink(`https://entrar?codigo=${CODIGO}&estado=${ESTADO}`)).toBeNull();
  });
  it("atalho para uma tela só com caminho interno", () => {
    expect(lerLink("forja://abrir/projetos")).toEqual({ tipo: "abrir", caminho: "/projetos" });
    expect(lerLink("forja://abrir/agente?t=1")).toEqual({ tipo: "abrir", caminho: "/agente?t=1" });
    expect(lerLink("forja://abrir//evil.com")).toBeNull();
    expect(lerLink("forja://abrir/a/../../b")).toEqual({ tipo: "abrir", caminho: "/b" });
    expect(lerLink("forja://abrir/x@evil.com")).toBeNull();
    expect(lerLink("forja://outra/coisa")).toBeNull();
  });
  it("acha o link nos argumentos da segunda instância", () => {
    expect(linkNosArgumentos(["Forja.exe", "--flag", "forja://abrir/central"])).toBe("forja://abrir/central");
    expect(linkNosArgumentos(["Forja.exe"])).toBeNull();
  });
});

describe("endereço do app", () => {
  it("só https, ou http em localhost", () => {
    expect(urlValida("https://app.forja.dev/qualquer")).toBe("https://app.forja.dev");
    expect(urlValida("http://localhost:3000")).toBe("http://localhost:3000");
    expect(urlValida("http://app.forja.dev")).toBeNull();
    expect(urlValida("https://user:senha@app.forja.dev")).toBeNull();
    expect(urlValida("file:///x")).toBeNull();
    expect(urlValida(undefined)).toBeNull();
  });
  it("a variável FORJA_URL troca o endereço e lixo cai no padrão", () => {
    expect(urlBase({ FORJA_URL: "http://127.0.0.1:3000" })).toBe("http://127.0.0.1:3000");
    expect(urlBase({ FORJA_URL: "javascript:alert(1)" })).toMatch(/^https:\/\//);
  });
});
