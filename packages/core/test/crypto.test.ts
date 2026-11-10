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

describe("chaves numeradas (rotação sem ler a chave antiga)", () => {
  const k1 = randomBytes(32).toString("base64");
  const k2 = randomBytes(32).toString("base64");
  const comAmbiente = <T>(env: Record<string, string | undefined>, fn: () => T): T => {
    const antes = { ...process.env };
    for (const n of ["ENCRYPTION_KEY", "ENCRYPTION_KEY_2", "ENCRYPTION_KEY_3"]) delete process.env[n];
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      for (const n of ["ENCRYPTION_KEY", "ENCRYPTION_KEY_2", "ENCRYPTION_KEY_3"]) delete process.env[n];
      Object.assign(process.env, antes);
    }
  };

  it("cifra com a maior chave presente e decifra pela chave do prefixo", async () => {
    const { chaveAtiva, chaveDoValor } = await import("../src/crypto");
    const antigo = comAmbiente({ ENCRYPTION_KEY: k1 }, () => encryptSecret("segredo-antigo"));
    expect(antigo.startsWith("v1.")).toBe(true);
    comAmbiente({ ENCRYPTION_KEY: k1, ENCRYPTION_KEY_2: k2 }, () => {
      expect(chaveAtiva()).toBe(2);
      const novo = encryptSecret("segredo-novo");
      expect(novo.startsWith("k2.")).toBe(true);
      expect(chaveDoValor(novo)).toBe(2);
      expect(decryptSecret(antigo)).toBe("segredo-antigo");
      expect(decryptSecret(novo)).toBe("segredo-novo");
    });
  });

  it("depois de apagar a chave antiga, o valor antigo dá erro claro", () => {
    const antigo = comAmbiente({ ENCRYPTION_KEY: k1 }, () => encryptSecret("x"));
    comAmbiente({ ENCRYPTION_KEY_2: k2 }, () => {
      expect(() => decryptSecret(antigo)).toThrow(/ENCRYPTION_KEY, que não está mais configurada/);
    });
  });

  it("impressão digital não revela a chave", async () => {
    const { digitalDaChave } = await import("../src/crypto");
    comAmbiente({ ENCRYPTION_KEY: k1 }, () => {
      const d = digitalDaChave(1)!;
      expect(d).toMatch(/^[0-9a-f]{8}$/);
      expect(k1).not.toContain(d);
      expect(digitalDaChave(2)).toBeNull();
    });
  });
});
