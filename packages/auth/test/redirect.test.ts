import { describe, expect, it } from "vitest";
import { caminhoInterno } from "../src/redirect";

describe("caminhoInterno (voltar para)", () => {
  it("aceita caminhos do próprio site", () => {
    expect(caminhoInterno("/projetos/abc?c=1#fim")).toBe("/projetos/abc?c=1#fim");
    expect(caminhoInterno("/convite/tok123")).toBe("/convite/tok123");
    expect(caminhoInterno("/a/../central")).toBe("/central");
  });

  it.each([
    "https://evil.example/login",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/%2E%2E//evil.com",
    "/a/../..//evil.com",
    "/convite/../..//evil.com",
    "javascript:alert(1)",
    "",
  ])("recusa %j", (v) => {
    expect(caminhoInterno(v)).toBe("/central");
  });

  it("parâmetro repetido (?next=a&next=b) não derruba a página", () => {
    expect(caminhoInterno(["/projetos", "//evil.com"])).toBe("/projetos");
    expect(caminhoInterno(["//evil.com"])).toBe("/central");
    expect(caminhoInterno({ x: 1 })).toBe("/central");
  });

  it("usa o padrão quando não há valor", () => {
    expect(caminhoInterno(undefined)).toBe("/central");
    expect(caminhoInterno(null, "/x")).toBe("/x");
  });
});
