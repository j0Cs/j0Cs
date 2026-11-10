import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Criptografia de segredos em repouso (chaves de API dos provedores, tokens de conectores).
 * AES-256-GCM com chaves mestras de 32 bytes (base64) nas variáveis de ambiente.
 *
 * Chaves numeradas, para trocar sem precisar ler a antiga (na Vercel ela é "sensitive"):
 *   ENCRYPTION_KEY     → chave 1 (prefixo "v1." nos valores gravados)
 *   ENCRYPTION_KEY_2   → chave 2 (prefixo "k2.")
 *   ENCRYPTION_KEY_3   → chave 3 (prefixo "k3.") ...
 * A Forja cifra sempre com a chave de maior número presente e decifra com a chave indicada no
 * prefixo. Rotação: crie a próxima variável nos dois projetos, clique em "Recifrar" no painel e,
 * depois, apague a variável antiga (doc 10).
 *
 * Formato: "<prefixo>.<iv>.<tag>.<ciphertext>" (base64url).
 */

const MAX_CHAVES = 20;

function decodificar(raw: string, nome: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error(`${nome} precisa ter 32 bytes em base64.`);
  return key;
}

const nomeDaChave = (n: number) => (n === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_${n}`);
const prefixo = (n: number) => (n === 1 ? "v1" : `k${n}`);

/** Chaves presentes no ambiente: número → chave. */
function chaves(env: NodeJS.ProcessEnv = process.env) {
  const m = new Map<number, Buffer>();
  for (let n = 1; n <= MAX_CHAVES; n++) {
    const raw = env[nomeDaChave(n)];
    if (raw) m.set(n, decodificar(raw, nomeDaChave(n)));
  }
  return m;
}

/** Número da chave usada para cifrar (a maior presente). */
export function chaveAtiva(env: NodeJS.ProcessEnv = process.env) {
  const ns = [...chaves(env).keys()];
  if (!ns.length) throw new Error("ENCRYPTION_KEY não definida. Gere uma com `pnpm gen:key`.");
  return Math.max(...ns);
}

/** Impressão digital da chave (8 caracteres do SHA-256), para conferir sem mostrar a chave. */
export function digitalDaChave(n: number, env: NodeJS.ProcessEnv = process.env) {
  const k = chaves(env).get(n);
  return k ? createHash("sha256").update(k).digest("hex").slice(0, 8) : null;
}

/** Números das chaves presentes no ambiente. */
export const chavesPresentes = (env: NodeJS.ProcessEnv = process.env) => [...chaves(env).keys()].sort((a, b) => a - b);

/** Com que chave um valor foi cifrado (null = formato desconhecido). */
export function chaveDoValor(payload: string): number | null {
  const p = payload.split(".", 1)[0] ?? "";
  if (p === "v1") return 1;
  const m = /^k(\d+)$/.exec(p);
  return m ? Number(m[1]) : null;
}

/**
 * Cifra. `rawKey` força uma chave específica (testes e o seed); sem ela, usa a chave ativa.
 */
export function encryptSecret(plaintext: string, rawKey?: string): string {
  let n: number;
  let key: Buffer;
  if (rawKey) {
    n = 1;
    key = decodificar(rawKey, "ENCRYPTION_KEY");
  } else {
    n = chaveAtiva();
    key = chaves().get(n)!;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [prefixo(n), iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [, iv, tag, data] = payload.split(".");
  const n = chaveDoValor(payload);
  if (n === null || !iv || !tag || data === undefined) throw new Error("Segredo em formato desconhecido.");
  let key: Buffer | undefined;
  if (rawKey) key = decodificar(rawKey, "ENCRYPTION_KEY");
  else {
    key = chaves().get(n);
    if (!key) throw new Error(`Este segredo foi cifrado com ${nomeDaChave(n)}, que não está mais configurada.`);
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Últimos 4 caracteres para exibir no painel ("••••a1b2"). */
export function secretHint(secret: string): string {
  return secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`;
}
