import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, secretHint } from "../src/crypto";

const key = randomBytes(32).toString("base64");

describe("encryptSecret", () => {
  it("criptografa e descriptografa", () => {
    const enc = encryptSecret("sk-ant-segredo-123", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("segredo");
    expect(decryptSecret(enc, key)).toBe("sk-ant-segredo-123");
  });

  it("gera IV diferente a cada chamada", () => {
    expect(encryptSecret("abc", key)).not.toBe(encryptSecret("abc", key));
  });

  it("rejeita payload adulterado", () => {
    const enc = encryptSecret("abc", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("xyz").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("rejeita chave mestra errada", () => {
    const enc = encryptSecret("abc", key);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });

  it("mostra só os 4 últimos caracteres", () => {
    expect(secretHint("sk-abcdef1234")).toBe("••••1234");
  });
});
