/**
 * Varredura automática do repositório antes da auditoria por IA (sem modelo, sem custo): segredos no
 * código, arquivos de ambiente versionados, instruções de assistentes de IA grandes e chamadas a APIs
 * de modelos (para o agente conferir cache e escolha de modelo). O agente recebe o resultado e não
 * repete esses achados.
 */
import { CONFIGS_DE_IA, tokensAprox } from "./estrutura";
import type { Persona } from "./personas";

export type Categoria = "seguranca" | "estrutura" | "qualidade" | "desempenho" | "economia";
export type Severidade = "critica" | "alta" | "media" | "baixa" | "info";

export interface Achado {
  categoria: Categoria;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  arquivo?: string | null;
  linha?: number | null;
  recomendacao: string;
  origem: "varredura" | "agente";
  /** Quem do time encontrou (achados do agente). */
  persona?: Persona | null;
}

export const CATEGORIAS: Record<Categoria, string> = {
  seguranca: "Segurança",
  estrutura: "Estrutura",
  qualidade: "Qualidade",
  desempenho: "Desempenho",
  economia: "Economia de tokens",
};

export const SEVERIDADES: Severidade[] = ["critica", "alta", "media", "baixa", "info"];

const IGNORADAS = /(^|\/)(node_modules|dist|build|out|\.next|vendor|coverage|\.turbo|__pycache__|\.venv|venv)\/|(\.min\.js|\.map|\.lock|lock\.json|lock\.yaml|\.svg|\.snap)$/;

/** Padrões de segredos conhecidos. Valores de exemplo óbvios são descartados. */
const SEGREDOS: { nome: string; re: RegExp; severidade: Severidade }[] = [
  { nome: "Chave da Anthropic", re: /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{30,}/g, severidade: "critica" },
  { nome: "Chave da OpenAI", re: /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{48}/g, severidade: "critica" },
  { nome: "Chave do Google (API)", re: /AIza[0-9A-Za-z_-]{35}/g, severidade: "alta" },
  { nome: "Chave da xAI", re: /xai-[A-Za-z0-9]{40,}/g, severidade: "critica" },
  { nome: "Chave secreta do Stripe", re: /(?:sk|rk)_live_[0-9A-Za-z]{20,}/g, severidade: "critica" },
  { nome: "Token do GitHub", re: /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}/g, severidade: "critica" },
  { nome: "Chave de acesso da AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severidade: "critica" },
  { nome: "Token do Slack", re: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severidade: "alta" },
  { nome: "Chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g, severidade: "critica" },
  { nome: "Chave secreta do Supabase", re: /sb_secret_[A-Za-z0-9_-]{20,}/g, severidade: "critica" },
  { nome: "URL de banco com senha", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/'"`@]+:[^\s@'"`]{6,}@[^\s'"`]+/g, severidade: "alta" },
];

const EXEMPLO = /(example|exemplo|sample|placeholder|your[_-]?|seu[_-]?|xxxx|\*\*\*|<[^>]+>|\$\{|changeme|senha@|password@|usuario:senha|user:pass)/i;

/** "sk-ant-api03-AbCd…": mostra só o começo, nunca o segredo inteiro. */
export const mascarar = (s: string) => `${s.slice(0, Math.min(10, Math.floor(s.length / 3)))}…(${s.length} caracteres)`;

/** JWT com role service_role (chave que ignora a RLS do Supabase). */
function jwtDeServico(texto: string) {
  const achados: string[] = [];
  for (const m of texto.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const corpo = JSON.parse(Buffer.from(m[0].split(".")[1]!, "base64url").toString("utf8")) as { role?: string };
      if (corpo.role === "service_role") achados.push(m[0]);
    } catch {
      // não é JWT válido
    }
  }
  return achados;
}

const linhaDe = (texto: string, indice: number) => texto.slice(0, indice).split("\n").length;

export function varrer(arquivos: Map<string, Buffer>, grandes: Set<string>): { achados: Achado[]; chamadasDeIa: string[] } {
  const achados: Achado[] = [];
  const chamadasDeIa: string[] = [];
  const vistos = new Set<string>();
  let segredos = 0;

  for (const [caminho, buf] of arquivos) {
    if (IGNORADAS.test(caminho) || buf.length > 1_000_000 || buf.includes(0)) continue;
    const texto = buf.toString("utf8");
    for (const s of SEGREDOS) {
      for (const m of texto.matchAll(s.re)) {
        const contexto = texto.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 10);
        if (EXEMPLO.test(contexto)) continue;
        const chave = `${s.nome}|${caminho}`;
        if (vistos.has(chave) || segredos >= 30) continue;
        vistos.add(chave);
        segredos++;
        achados.push({
          categoria: "seguranca",
          severidade: s.severidade,
          titulo: `${s.nome} no código`,
          detalhe: `Encontrado ${mascarar(m[0])}. Qualquer pessoa com acesso ao repositório (ou ao histórico do git) pode usar.`,
          arquivo: caminho,
          linha: linhaDe(texto, m.index ?? 0),
          recomendacao: "Revogue e gere outra no painel do serviço agora; depois mova para variáveis de ambiente ou um cofre e apague do histórico do git.",
          origem: "varredura",
        });
      }
    }
    for (const jwt of jwtDeServico(texto)) {
      const chave = `jwt|${caminho}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push({
        categoria: "seguranca",
        severidade: "critica",
        titulo: "Chave service_role do Supabase no código",
        detalhe: `Encontrado ${mascarar(jwt)}. Essa chave ignora a RLS: dá acesso total ao banco.`,
        arquivo: caminho,
        linha: linhaDe(texto, texto.indexOf(jwt)),
        recomendacao: "Gere chaves novas no Supabase (Settings → API) e use a service_role só no servidor, por variável de ambiente.",
        origem: "varredura",
      });
    }
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(caminho) && /(@anthropic-ai\/sdk|from ["']openai["']|require\(["']openai["']\)|@google\/genai|@google\/generative-ai|^\s*(import|from) (anthropic|openai)\b|api\.anthropic\.com|api\.openai\.com)/m.test(texto)) {
      chamadasDeIa.push(caminho);
    }
  }

  const envs = [...arquivos.keys()].filter((c) => /(^|\/)\.env(\.[^/]*)?$/.test(c) && !/\.(example|sample|template|dist)$/i.test(c));
  for (const c of envs.slice(0, 5)) {
    achados.push({
      categoria: "seguranca",
      severidade: "alta",
      titulo: "Arquivo de ambiente versionado",
      detalhe: `${c} está no repositório. Costuma guardar chaves e senhas.`,
      arquivo: c,
      recomendacao: "Tire do git (git rm --cached), coloque no .gitignore, troque os segredos que estavam nele e mantenha só um .env.example sem valores.",
      origem: "varredura",
    });
  }

  for (const c of [...arquivos.keys()].filter((x) => CONFIGS_DE_IA.test(x) && /\.md$|rules/.test(x))) {
    const tokens = tokensAprox(arquivos.get(c)!.length);
    if (tokens <= 2_000) continue;
    achados.push({
      categoria: "economia",
      severidade: tokens > 8_000 ? "alta" : "media",
      titulo: `Instruções do assistente longas: ${c}`,
      detalhe: `≈ ${tokens.toLocaleString("pt-BR")} tokens carregados no começo de toda sessão do assistente (Claude Code, Codex, Gemini CLI, Cursor…).`,
      arquivo: c,
      recomendacao: "Deixe só regras que valem sempre (comandos, convenções, onde fica cada coisa). Mova guias longos para arquivos que o assistente lê só quando precisa (skills, docs referenciados) e corte o que repete o próprio código.",
      origem: "varredura",
    });
  }

  if (grandes.size) {
    achados.push({
      categoria: "estrutura",
      severidade: "baixa",
      titulo: "Arquivos grandes no repositório",
      detalhe: `${grandes.size} arquivo(s) acima de 1 MB: ${[...grandes].slice(0, 5).join(", ")}${grandes.size > 5 ? "…" : ""}.`,
      recomendacao: "Binários e dados grandes deixam clones e o trabalho dos assistentes mais lentos. Use Git LFS ou um storage e ignore-os no git.",
      origem: "varredura",
    });
  }

  return { achados, chamadasDeIa: chamadasDeIa.slice(0, 40) };
}
