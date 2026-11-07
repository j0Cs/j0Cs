const BASE = "http://interno.invalid";

/**
 * "Voltar para" seguro: só devolve caminhos deste site, senão `padrao`.
 *
 * Confere a entrada (precisa começar com "/", sem barra invertida, espaço ou caractere de
 * controle, que navegadores tratam como separador de host) E a saída já normalizada: o
 * parser de URL resolve "/./" e "/../", e "/.//evil.com" vira "//evil.com" (outro host).
 */
export function caminhoInterno(v: unknown, padrao = "/central"): string {
  // ?next=a&next=b chega como lista: pega o primeiro (e qualquer coisa que não seja texto cai no padrão)
  if (Array.isArray(v)) v = v[0];
  if (typeof v !== "string" || !v.startsWith("/") || /[\\\s\x00-\x1f\x7f]/.test(v)) return padrao;
  try {
    const u = new URL(v, BASE);
    const saida = u.pathname + u.search + u.hash;
    if (u.origin !== BASE || saida.startsWith("//") || saida.startsWith("/\\")) return padrao;
    return saida;
  } catch {
    return padrao;
  }
}
