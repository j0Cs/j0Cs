import { gunzipSync } from "node:zlib";

/**
 * Cópia de trabalho do agente: os arquivos do repositório num commit (vindos do tarball) mais as
 * alterações da tarefa. Nada é escrito no GitHub até a aprovação.
 */

export const LIMITE_ARQUIVO = 1_000_000;
const LIMITE_TOTAL = 200_000_000;
const LIMITE_ARQUIVOS = 30_000;

function texto(h: Buffer, inicio: number, tamanho: number) {
  const s = h.subarray(inicio, inicio + tamanho);
  const fim = s.indexOf(0);
  return s.subarray(0, fim < 0 ? s.length : fim).toString("utf8");
}

function paxPath(dados: Buffer) {
  let pos = 0;
  const s = dados.toString("utf8");
  while (pos < s.length) {
    const espaco = s.indexOf(" ", pos);
    if (espaco < 0) break;
    const len = Number(s.slice(pos, espaco));
    if (!len) break;
    const registro = s.slice(espaco + 1, pos + len - 1);
    const igual = registro.indexOf("=");
    if (registro.slice(0, igual) === "path") return registro.slice(igual + 1);
    pos += len;
  }
  return null;
}

/**
 * Extrai um .tar.gz do GitHub (pasta raiz "dono-repo-sha/" removida). Arquivos acima de 1 MB entram
 * só pelo nome (o agente sabe que existem, mas não lê).
 */
export function extrairTarGz(buf: Buffer) {
  const tar = gunzipSync(buf, { maxOutputLength: LIMITE_TOTAL });
  const arquivos = new Map<string, Buffer>();
  const grandes = new Set<string>();
  let pos = 0;
  let nomeLongo: string | null = null;
  let nomePax: string | null = null;
  while (pos + 512 <= tar.length && arquivos.size + grandes.size < LIMITE_ARQUIVOS) {
    const h = tar.subarray(pos, pos + 512);
    if (h.every((b) => b === 0)) break;
    const nome = texto(h, 0, 100);
    const prefixo = texto(h, 345, 155);
    const tamanho = parseInt(texto(h, 124, 12).trim() || "0", 8) || 0;
    const tipo = String.fromCharCode(h[156] ?? 0);
    pos += 512;
    const dados = tar.subarray(pos, pos + tamanho);
    pos += Math.ceil(tamanho / 512) * 512;

    if (tipo === "x") {
      nomePax = paxPath(dados);
      continue;
    }
    if (tipo === "g") continue;
    if (tipo === "L") {
      nomeLongo = dados.toString("utf8").replace(/\0[\s\S]*$/, "");
      continue;
    }
    const completo = nomePax ?? nomeLongo ?? (prefixo ? `${prefixo}/${nome}` : nome);
    nomePax = nomeLongo = null;
    if (tipo !== "0" && tipo !== "\0" && tipo !== "") continue; // pastas, links
    const caminho = completo.split("/").slice(1).join("/");
    if (!caminho) continue;
    if (tamanho > LIMITE_ARQUIVO) grandes.add(caminho);
    else arquivos.set(caminho, Buffer.from(dados));
  }
  return { arquivos, grandes };
}

export class CaminhoInvalido extends Error {}

/** Caminho relativo seguro dentro do repositório. */
export function normalizarCaminho(p: unknown) {
  if (typeof p !== "string") throw new CaminhoInvalido("Caminho ausente.");
  const c = p.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!c || c.length > 300 || c.includes("\0")) throw new CaminhoInvalido("Caminho inválido.");
  const partes = c.split("/");
  if (partes.some((x) => x === ".." || x === "." || x === "")) throw new CaminhoInvalido("Caminho inválido.");
  if (partes[0] === ".git") throw new CaminhoInvalido("A pasta .git não pode ser alterada.");
  return c;
}

const ehBinario = (b: Buffer) => b.subarray(0, 8000).includes(0);

export class Workspace {
  constructor(
    private readonly original: Map<string, Buffer>,
    private readonly grandes: Set<string> = new Set(),
    private readonly mudancas: Map<string, string | null> = new Map(),
  ) {}

  static vazio() {
    return new Workspace(new Map());
  }

  existe(caminho: string) {
    if (this.mudancas.has(caminho)) return this.mudancas.get(caminho) !== null;
    return this.original.has(caminho) || this.grandes.has(caminho);
  }

  /** Texto atual do arquivo; null se não existir. Lança se for binário ou grande demais. */
  ler(caminho: string): string | null {
    if (this.mudancas.has(caminho)) return this.mudancas.get(caminho) ?? null;
    if (this.grandes.has(caminho)) throw new CaminhoInvalido(`${caminho} tem mais de 1 MB e não pode ser lido pelo agente.`);
    const b = this.original.get(caminho);
    if (!b) return null;
    if (ehBinario(b)) throw new CaminhoInvalido(`${caminho} é um arquivo binário.`);
    return b.toString("utf8");
  }

  original_(caminho: string): string | null {
    const b = this.original.get(caminho);
    return b && !ehBinario(b) ? b.toString("utf8") : null;
  }

  listar(prefixo = "") {
    const p = prefixo ? `${prefixo.replace(/\/+$/, "")}/` : "";
    const todos = new Set<string>([...this.original.keys(), ...this.grandes]);
    for (const [c, v] of this.mudancas) {
      if (v === null) todos.delete(c);
      else todos.add(c);
    }
    return [...todos].filter((c) => !p || c.startsWith(p)).sort();
  }

  escrever(caminho: string, conteudo: string) {
    this.mudancas.set(caminho, conteudo);
  }

  apagar(caminho: string) {
    this.mudancas.set(caminho, null);
  }

  /** Arquivos alterados de fato (conteúdo diferente do original). */
  alteracoes() {
    const lista: { path: string; antes: string | null; depois: string | null }[] = [];
    for (const [path, depois] of this.mudancas) {
      const b = this.original.get(path);
      const antes = b ? b.toString("utf8") : null;
      if (antes === depois) continue;
      if (depois === null && !b && !this.grandes.has(path)) continue; // criou e apagou
      lista.push({ path, antes, depois });
    }
    return lista.sort((a, b) => a.path.localeCompare(b.path));
  }

  todasAsMudancas() {
    return this.mudancas;
  }
}
