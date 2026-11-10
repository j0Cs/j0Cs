/**
 * CPF e CNPJ: limpeza, validação dos dígitos verificadores e formatação.
 * O CNPJ aceita o formato alfanumérico (letras nas 12 primeiras posições), em vigor desde julho de 2026.
 */
export type TipoDeDocumento = "cpf" | "cnpj";

const limpar = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function cnpjValido(d: string) {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const digito = (ate: number) => {
    let soma = 0;
    let peso = 2;
    for (let i = ate - 1; i >= 0; i--) {
      soma += valor(d[i]!) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/** Devolve o documento limpo e o tipo, ou null se os dígitos verificadores não fecham. */
export function lerDocumento(entrada: unknown): { tipo: TipoDeDocumento; valor: string } | null {
  if (typeof entrada !== "string") return null;
  const d = limpar(entrada);
  if (d.length === 11 && cpfValido(d)) return { tipo: "cpf", valor: d };
  if (d.length === 14 && cnpjValido(d)) return { tipo: "cnpj", valor: d };
  return null;
}

export function formatarDocumento(valor: string) {
  if (valor.length === 11) return valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (valor.length === 14) return valor.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return valor;
}

/** Mostra só o começo e o fim (telas e logs). */
export function mascararDocumento(valor: string) {
  return valor.length === 11 ? `${valor.slice(0, 3)}.***.***-${valor.slice(9)}` : `${valor.slice(0, 2)}.***.***/****-${valor.slice(12)}`;
}

/** Telefone brasileiro com DDD (10 ou 11 dígitos; aceita +55 na frente). Devolve só os dígitos, sem o 55. */
export function lerTelefone(entrada: unknown): string | null {
  if (typeof entrada !== "string") return null;
  let d = entrada.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d[0] === "0" || d[1] === "0" || (d.length === 11 && d[2] !== "9")) return null;
  return d;
}

export const formatarTelefone = (d: string) => (d.length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3") : d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3"));
