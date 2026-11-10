/**
 * Endereço do app web que a janela carrega. Vem do build (FORJA_URL na hora de empacotar), com
 * troca em tempo de execução pela variável FORJA_URL (desenvolvimento e testes).
 */
declare const __FORJA_URL__: string;

export function urlValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function urlBase(env: NodeJS.ProcessEnv = process.env): string {
  return urlValida(env.FORJA_URL) ?? urlValida(typeof __FORJA_URL__ === "string" ? __FORJA_URL__ : null) ?? "https://forja-web-rampin-tech.vercel.app";
}
