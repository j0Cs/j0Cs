/**
 * Para onde cada endereço vai: fica na janela do app, abre no navegador do sistema ou é barrado.
 * Só a origem do app fica na janela. É isso que garante que window.forjaDesktop nunca apareça para
 * outro site.
 */
export type Destino = "app" | "navegador" | "barrar";

export function destinoDe(url: string, base: string): Destino {
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(base);
  } catch {
    return "barrar";
  }
  if (u.origin === b.origin) return "app";
  // Enquanto o app roda num *.vercel.app protegido, o login da Vercel precisa acontecer na janela.
  if (b.hostname.endsWith(".vercel.app") && u.protocol === "https:" && u.hostname === "vercel.com") return "app";
  if (u.protocol === "https:" || u.protocol === "mailto:") return "navegador";
  return "barrar";
}

export type LinkDoApp = { tipo: "entrar"; codigo: string; estado: string } | { tipo: "abrir"; caminho: string };

/** forja://entrar?codigo=…&estado=… (volta do login) e forja://abrir/projetos (atalho para uma tela). */
export function lerLink(link: string): LinkDoApp | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== "forja:") return null;
  if (u.hostname === "entrar") {
    const codigo = u.searchParams.get("codigo") ?? "";
    const estado = u.searchParams.get("estado") ?? "";
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(codigo) || !/^[A-Za-z0-9_-]{32,64}$/.test(estado)) return null;
    return { tipo: "entrar", codigo, estado };
  }
  if (u.hostname === "abrir") {
    const caminho = u.pathname + u.search;
    if (!/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(caminho) || caminho.startsWith("//") || caminho.includes("..")) return null;
    return { tipo: "abrir", caminho };
  }
  return null;
}

/** O link forja:// entre os argumentos de uma segunda instância (Windows e Linux). */
export const linkNosArgumentos = (argv: string[]) => argv.find((a) => a.startsWith("forja://")) ?? null;
