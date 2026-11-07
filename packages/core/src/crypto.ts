import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia de segredos em repouso (chaves de API dos provedores, tokens de
 * conectores). AES-256-GCM com chave mestra de 32 bytes em ENCRYPTION_KEY.
 *
 * Formato salvo no banco: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 * O prefixo de versão permite rotacionar a chave mestra no futuro (v2 = KMS).
 */

const VERSION = "v1";

function masterKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw) {
    throw new Error("ENCRYPTION_KEY não definida. Gere uma com `pnpm gen:key`.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY precisa ter 32 bytes em base64.");
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Segredo em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", masterKey(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Últimos 4 caracteres para exibir no painel ("••••a1b2"). */
export function secretHint(secret: string): string {
  return secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`;
}
