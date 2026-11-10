/**
 * Lê uma pasta do computador para a mesma análise que a Forja faz num repositório do GitHub:
 * estrutura e varredura, sem modelo de IA e sem enviar nada para fora.
 *
 * Num repositório git entram só os arquivos versionados (o mesmo que o GitHub teria); fora dele, a
 * pasta é percorrida ignorando dependências e saídas de build. Links simbólicos não são seguidos.
 */
import { execFile } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { analisarEstrutura } from "../../../packages/agent/src/estrutura";
import { varrer } from "../../../packages/agent/src/varredura";

export const LIMITE_ARQUIVO = 1_000_000;
export const LIMITE_TOTAL = 200_000_000;
export const LIMITE_ARQUIVOS = 30_000;

const PULAR = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "vendor", "coverage", ".turbo", ".vercel",
  "__pycache__", ".venv", "venv", "target", ".idea", ".gradle", "Pods", ".cache",
]);

export interface Leitura {
  arquivos: Map<string, Buffer>;
  grandes: Set<string>;
  versionada: boolean;
  truncada: boolean;
}

function gitListar(raiz: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile("git", ["ls-files", "-z"], { cwd: raiz, maxBuffer: 64 * 1024 * 1024, timeout: 20_000, windowsHide: true }, (erro, saida) => {
      if (erro) return resolve(null);
      resolve(String(saida).split("\0").filter(Boolean));
    });
  });
}

async function percorrer(raiz: string): Promise<{ lista: string[]; truncada: boolean }> {
  const lista: string[] = [];
  const fila = [""];
  while (fila.length) {
    const rel = fila.pop()!;
    let itens;
    try {
      itens = await readdir(path.join(raiz, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of itens) {
      const caminho = rel ? `${rel}/${item.name}` : item.name;
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (!PULAR.has(item.name)) fila.push(caminho);
      } else if (item.isFile()) {
        lista.push(caminho);
        if (lista.length >= LIMITE_ARQUIVOS) return { lista, truncada: true };
      }
    }
  }
  return { lista, truncada: false };
}

export async function lerPasta(raiz: string): Promise<Leitura> {
  const doGit = await gitListar(raiz);
  let lista: string[];
  let truncada = false;
  if (doGit) {
    truncada = doGit.length > LIMITE_ARQUIVOS;
    lista = doGit.slice(0, LIMITE_ARQUIVOS);
  } else {
    ({ lista, truncada } = await percorrer(raiz));
  }
  lista.sort();

  const arquivos = new Map<string, Buffer>();
  const grandes = new Set<string>();
  let total = 0;
  for (const rel of lista) {
    const abs = path.join(raiz, rel);
    // nada fora da pasta escolhida, mesmo que o git liste um caminho estranho
    if (path.relative(raiz, abs).startsWith("..") || path.isAbsolute(rel)) continue;
    try {
      const info = await lstat(abs);
      if (!info.isFile()) continue;
      if (info.size > LIMITE_ARQUIVO) {
        grandes.add(rel);
        continue;
      }
      if (total + info.size > LIMITE_TOTAL) {
        truncada = true;
        break;
      }
      arquivos.set(rel.split(path.sep).join("/"), await readFile(abs));
      total += info.size;
    } catch {
      // apagado ou sem permissão: segue
    }
  }
  return { arquivos, grandes, versionada: doGit !== null, truncada };
}

/** Nome da branch pelo .git/HEAD (sem rodar o git). */
export async function branchDaPasta(raiz: string): Promise<string> {
  try {
    const head = (await readFile(path.join(raiz, ".git", "HEAD"), "utf8")).trim();
    const m = head.match(/^ref: refs\/heads\/(.+)$/);
    return m ? m[1]! : head.slice(0, 12);
  } catch {
    return "sem git";
  }
}

export async function analisarPasta(raiz: string) {
  const leitura = await lerPasta(raiz);
  const branch = await branchDaPasta(raiz);
  const estrutura = analisarEstrutura(leitura.arquivos, leitura.grandes, { repo: path.basename(raiz), branch, sha: null });
  const { achados, chamadasDeIa } = varrer(leitura.arquivos, leitura.grandes);
  // fora do git não dá para dizer que um .env está "versionado"
  const filtrados = leitura.versionada ? achados : achados.filter((a) => a.titulo !== "Arquivo de ambiente versionado");
  return { estrutura, achados: filtrados, chamadasDeIa, versionada: leitura.versionada, truncada: leitura.truncada };
}
