/**
 * Liga o envio de uso do Claude Code, do Codex e do Gemini CLI para a Forja editando o arquivo de
 * configuração de cada ferramenta na pasta pessoal. O conteúdo é o mesmo que a página Assistentes de
 * IA mostra para colar à mão (packages/insights/src/configuracao.ts), juntado ao que já existe.
 *
 * Regras: nada é gravado sem a confirmação nativa (feita em ipc.ts); o arquivo anterior fica numa
 * cópia ao lado; arquivo que não dá para ler como JSON ou com [otel] em formato inesperado não é tocado.
 */
import { chmod, copyFile, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { configuracao } from "../../../packages/insights/src/configuracao";

export type FerramentaLocal = "claude_code" | "codex" | "gemini_cli";
export const FERRAMENTAS_LOCAIS: Record<FerramentaLocal, { nome: string; arquivo: string[] }> = {
  claude_code: { nome: "Claude Code", arquivo: [".claude", "settings.json"] },
  codex: { nome: "Codex", arquivo: [".codex", "config.toml"] },
  gemini_cli: { nome: "Gemini CLI", arquivo: [".gemini", "settings.json"] },
};
export const ehFerramentaLocal = (v: unknown): v is FerramentaLocal => typeof v === "string" && Object.hasOwn(FERRAMENTAS_LOCAIS, v);
export const tokenValido = (v: unknown): v is string => typeof v === "string" && /^fj_otlp_[A-Za-z0-9_-]{20,200}$/.test(v);

export const arquivoDe = (f: FerramentaLocal, home: string) => path.join(home, ...FERRAMENTAS_LOCAIS[f].arquivo);
const raizOtlp = (base: string) => `${base.replace(/\/+$/, "")}/api/otlp`;

const mascarar = (v: unknown) => String(v).replace(/fj_otlp_[A-Za-z0-9_-]+/g, (t) => `${t.slice(0, 12)}…`);
type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

function lerJson(texto: string | null): Objeto | null {
  if (texto === null || !texto.trim()) return {};
  try {
    const v: unknown = JSON.parse(texto);
    return ehObjeto(v) ? v : null;
  } catch {
    return null;
  }
}

const CABECALHO_OTEL = /^[ \t]*\[otel\][ \t]*(#.*)?$/m;

/** Posição do bloco [otel] (com as subtabelas [otel.…]) num config.toml. */
function blocoOtel(texto: string): { inicio: number; fim: number } | null {
  const m = CABECALHO_OTEL.exec(texto);
  if (!m) return null;
  const inicio = m.index;
  const resto = texto.slice(inicio + m[0].length);
  const proxima = /^[ \t]*\[\[?(?!otel[.\]])[^\n]*$/m.exec(resto);
  return { inicio, fim: proxima ? inicio + m[0].length + proxima.index : texto.length };
}

export type Mescla = { texto: string; mudancas: string[] } | { erro: string };

/** O arquivo novo (texto) e a lista do que muda, sem tocar no disco. */
export function mesclar(f: FerramentaLocal, atual: string | null, base: string, token: string): Mescla {
  const novo = configuracao(f, base, token).conteudo;

  if (f === "codex") {
    const texto = atual ?? "";
    if (/^[ \t]*otel[ \t]*[.=]/m.test(texto)) return { erro: "O config.toml define otel de outro jeito (chave pontilhada). Ajuste à mão para não quebrar o arquivo." };
    const bloco = blocoOtel(texto);
    if (!bloco) {
      const antes = texto.trim() ? `${texto.replace(/\s*$/, "")}\n\n` : "";
      return { texto: `${antes}${novo}\n`, mudancas: ["[otel]: seção adicionada (envio de uso para a Forja, sem prompts)"] };
    }
    const depois = texto.slice(bloco.fim);
    const resultado = `${texto.slice(0, bloco.inicio)}${novo}\n${depois.trim() ? `\n${depois.replace(/^\s*/, "")}` : ""}`;
    if (resultado === texto) return { texto, mudancas: [] };
    return { texto: resultado, mudancas: ["[otel]: seção substituída (a anterior fica na cópia de segurança)"] };
  }

  const existente = lerJson(atual);
  if (!existente) return { erro: "O arquivo existe, mas não é um JSON que eu consiga ler (comentários ou erro de sintaxe). Não mexi nele." };
  const chaves = JSON.parse(novo) as Record<string, Objeto>;
  const resultado: Objeto = { ...existente };
  const mudancas: string[] = [];
  for (const [grupo, valores] of Object.entries(chaves)) {
    const antigo = existente[grupo];
    if (antigo !== undefined && !ehObjeto(antigo)) return { erro: `"${grupo}" no arquivo não é um objeto. Não mexi nele.` };
    const junto: Objeto = { ...(antigo ?? {}) };
    for (const [k, v] of Object.entries(valores)) {
      if (junto[k] !== v) mudancas.push(`${grupo}.${k}: ${junto[k] === undefined ? "(vazio)" : mascarar(junto[k])} → ${mascarar(v)}`);
      junto[k] = v;
    }
    resultado[grupo] = junto;
  }
  if (!mudancas.length && atual !== null) return { texto: atual, mudancas };
  return { texto: `${JSON.stringify(resultado, null, 2)}\n`, mudancas };
}

export function situacaoDe(f: FerramentaLocal, atual: string | null, base: string): { situacao: "nao_configurada" | "forja" | "outro"; ilegivel: boolean } {
  const raiz = raizOtlp(base);
  if (atual === null || !atual.trim()) return { situacao: "nao_configurada", ilegivel: false };
  if (f === "codex") {
    const bloco = blocoOtel(atual);
    if (!bloco) return { situacao: "nao_configurada", ilegivel: false };
    return { situacao: atual.slice(bloco.inicio, bloco.fim).includes(raiz) ? "forja" : "outro", ilegivel: false };
  }
  const obj = lerJson(atual);
  if (!obj) return { situacao: "nao_configurada", ilegivel: true };
  if (f === "claude_code") {
    const env = ehObjeto(obj.env) ? obj.env : {};
    const destino = String(env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "");
    if (destino.startsWith(raiz)) return { situacao: "forja", ilegivel: false };
    return { situacao: destino || env.CLAUDE_CODE_ENABLE_TELEMETRY ? "outro" : "nao_configurada", ilegivel: false };
  }
  const t = ehObjeto(obj.telemetry) ? obj.telemetry : {};
  if (String(t.otlpEndpoint ?? "").startsWith(raiz)) return { situacao: "forja", ilegivel: false };
  return { situacao: t.enabled || t.otlpEndpoint ? "outro" : "nao_configurada", ilegivel: false };
}

export async function lerConfig(arquivo: string): Promise<string | null> {
  try {
    return await readFile(arquivo, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Grava o arquivo novo. O anterior vira `<arquivo>.forja-backup`. Devolve o caminho da cópia (ou null). */
export async function gravarConfig(arquivo: string, texto: string): Promise<string | null> {
  await mkdir(path.dirname(arquivo), { recursive: true });
  // quem usa gerenciador de dotfiles tem um link aqui: grava no arquivo de verdade, sem trocar o link
  const alvo = await realpath(arquivo).catch(() => arquivo);
  let copia: string | null = null;
  if ((await lerConfig(alvo)) !== null) {
    copia = `${arquivo}.forja-backup`;
    await copyFile(alvo, copia);
    if (process.platform !== "win32") await chmod(copia, 0o600);
  }
  const temporario = `${alvo}.forja-${process.pid}.tmp`;
  await writeFile(temporario, texto, { encoding: "utf8", mode: 0o600 });
  await rename(temporario, alvo);
  return copia;
}
