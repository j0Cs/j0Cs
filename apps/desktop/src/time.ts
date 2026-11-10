/**
 * Instala o time de especialistas nos arquivos de uma pasta local (o mesmo conteúdo do PR que a
 * Forja abre no GitHub). AGENTS.md e GEMINI.md existentes são preservados: só o bloco da Forja entra.
 */
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { arquivosDoTime, FERRAMENTAS_DO_TIME, mesclarBloco, type FerramentaDoTime } from "../../../packages/agent/src/personas";

export interface Planejado {
  caminho: string;
  estado: "novo" | "muda" | "igual";
  conteudo: string;
}

export function ferramentasValidas(v: unknown): FerramentaDoTime[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((f): f is FerramentaDoTime => typeof f === "string" && Object.hasOwn(FERRAMENTAS_DO_TIME, f)))];
}

async function lerSeExiste(abs: string) {
  try {
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

export async function planejarTime(raiz: string, ferramentas: FerramentaDoTime[]): Promise<Planejado[]> {
  const plano: Planejado[] = [];
  for (const a of arquivosDoTime(ferramentas)) {
    const atual = await lerSeExiste(path.join(raiz, a.path));
    const conteudo = a.bloco ? mesclarBloco(atual, a.content) : a.content;
    plano.push({ caminho: a.path, conteudo, estado: atual === null ? "novo" : atual === conteudo ? "igual" : "muda" });
  }
  return plano;
}

/** A pasta de destino (seguindo links) precisa continuar dentro da pasta escolhida. */
async function dentroDaRaiz(raiz: string, abs: string) {
  const raizReal = await realpath(raiz);
  let dir = path.dirname(abs);
  // sobe até a primeira pasta que já existe
  for (;;) {
    try {
      const real = await realpath(dir);
      const rel = path.relative(raizReal, real);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    } catch {
      const acima = path.dirname(dir);
      if (acima === dir) return false;
      dir = acima;
    }
  }
}

export async function gravarTime(raiz: string, plano: Planejado[]): Promise<string[]> {
  const gravados: string[] = [];
  for (const p of plano) {
    if (p.estado === "igual") continue;
    const abs = path.join(raiz, p.caminho);
    if (!(await dentroDaRaiz(raiz, abs))) throw new Error(`${p.caminho} aponta para fora da pasta.`);
    const info = await lstat(abs).catch(() => null);
    if (info?.isSymbolicLink()) throw new Error(`${p.caminho} é um link simbólico; não foi alterado.`);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, p.conteudo, "utf8");
    gravados.push(p.caminho);
  }
  return gravados;
}
