import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Um JSON pequeno na pasta de dados do app (pastas recentes, tamanho da janela). */
export class Guardado<T> {
  constructor(
    private arquivo: string,
    private padrao: T,
  ) {}
  ler(): T {
    try {
      return JSON.parse(readFileSync(this.arquivo, "utf8")) as T;
    } catch {
      return this.padrao;
    }
  }
  gravar(valor: T) {
    try {
      mkdirSync(path.dirname(this.arquivo), { recursive: true });
      writeFileSync(this.arquivo, JSON.stringify(valor, null, 2));
    } catch {
      // sem disco ou sem permissão: fica só na memória
    }
  }
}
