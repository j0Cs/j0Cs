/**
 * Recomendações de economia a partir do uso agregado de cada ferramenta e modelo. Regras simples e
 * explicáveis: cada recomendação diz o número que a disparou.
 */
import type { Ferramenta } from "./ferramentas";

export interface UsoAgregado {
  tool: Ferramenta;
  model: string;
  requisicoes: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsdMicros: number;
  /** Requisições de subagentes (Claude Code). */
  subagente: number;
}

export interface Recomendacao {
  impacto: "alto" | "medio" | "baixo";
  ferramenta: Ferramenta | null;
  titulo: string;
  detalhe: string;
  comoFazer: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mil = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi` : `${Math.round(n / 1000)} mil`);

/** Modelos de topo (mais caros por token) de cada empresa. */
const MODELO_DE_TOPO = /opus|fable|mythos|gpt-[0-9.]+-pro|o3-pro|gemini-[0-9.]+-pro|grok-[0-9.]+-heavy/i;

const COMO_MODELO: Record<Ferramenta, string> = {
  claude_code: "No Claude Code, use /model sonnet para o dia a dia e deixe o Opus para planejamento e problemas difíceis (no Claude Opus 5.5 também dá para baixar o esforço com /effort).",
  codex: "No Codex, escolha um modelo mais leve em /model para tarefas simples, ou defina model no ~/.codex/config.toml.",
  gemini_cli: "No Gemini CLI, use /model para trocar para um Flash nas tarefas de rotina.",
  grok_build: "No Grok Build, troque para um modelo mais leve nas tarefas de rotina.",
};

const COMO_CACHE: Record<Ferramenta, string> = {
  claude_code:
    "O cache cai quando o começo do contexto muda. Durante a sessão, evite editar o CLAUDE.md, ligar ou desligar servidores MCP e trocar de modelo; prefira continuar a sessão (claude --continue) a abrir outra para o mesmo assunto.",
  codex: "Mantenha as instruções (AGENTS.md) e a configuração estáveis durante a sessão e continue a mesma conversa em vez de abrir outra para o mesmo assunto.",
  gemini_cli: "Mantenha o GEMINI.md e as extensões estáveis durante a sessão e continue a mesma conversa para o mesmo assunto.",
  grok_build: "Mantenha as instruções estáveis durante a sessão e continue a mesma conversa para o mesmo assunto.",
};

export function recomendar(usos: UsoAgregado[]): Recomendacao[] {
  const recs: Recomendacao[] = [];
  const porFerramenta = new Map<Ferramenta, UsoAgregado[]>();
  for (const u of usos) porFerramenta.set(u.tool, [...(porFerramenta.get(u.tool) ?? []), u]);

  for (const [tool, lista] of porFerramenta) {
    const soma = (f: (u: UsoAgregado) => number) => lista.reduce((s, u) => s + f(u), 0);
    const req = soma((u) => u.requisicoes);
    if (req < 20) continue;
    const entrada = soma((u) => u.inputTokens);
    const cacheLido = soma((u) => u.cacheReadTokens);
    const cacheEscrito = soma((u) => u.cacheWriteTokens);
    const saida = soma((u) => u.outputTokens);
    const raciocinio = soma((u) => u.reasoningTokens);
    const contexto = entrada + cacheLido + cacheEscrito;

    // 1) cache
    const taxa = contexto ? cacheLido / contexto : 1;
    if (contexto > 2_000_000 && taxa < 0.6) {
      recs.push({
        impacto: taxa < 0.35 ? "alto" : "medio",
        ferramenta: tool,
        titulo: `Pouco aproveitamento de cache (${pct(taxa)} do contexto)`,
        detalhe: `De ${mil(contexto)} tokens de contexto enviados, só ${pct(taxa)} vieram do cache. Token lido do cache custa cerca de 10% do preço cheio.`,
        comoFazer: COMO_CACHE[tool],
      });
    }

    // 2) contexto grande por requisição
    const medio = contexto / req;
    if (medio > 100_000) {
      recs.push({
        impacto: medio > 200_000 ? "alto" : "medio",
        ferramenta: tool,
        titulo: `Contexto grande em cada pedido (média de ${mil(medio)} tokens)`,
        detalhe: "Cada pedido manda a conversa inteira de novo. Sessões longas e muitos arquivos lidos fazem cada passo ficar mais caro.",
        comoFazer:
          tool === "claude_code"
            ? "Use /clear ao trocar de assunto e /compact em sessões longas; desligue servidores MCP que não usa (as definições das ferramentas vão em todo pedido) e enxugue o CLAUDE.md."
            : "Comece uma conversa nova ao trocar de assunto, compacte sessões longas e enxugue as instruções fixas do projeto.",
      });
    }

    // 3) modelo de topo para tudo
    const topo = lista.filter((u) => MODELO_DE_TOPO.test(u.model));
    const reqTopo = topo.reduce((s, u) => s + u.requisicoes, 0);
    if (req >= 100 && reqTopo / req > 0.7) {
      recs.push({
        impacto: "alto",
        ferramenta: tool,
        titulo: `${pct(reqTopo / req)} dos pedidos no modelo mais caro`,
        detalhe:
          tool === "claude_code"
            ? "O Claude Sonnet 5.5 custa metade do Opus 5.5 por token e resolve bem a maior parte do trabalho de rotina; o Haiku 5.5 é 40 vezes mais barato que o Opus para buscas e tarefas simples."
            : "Modelos menores da mesma família resolvem a maior parte do trabalho de rotina por uma fração do preço.",
        comoFazer: COMO_MODELO[tool],
      });
    }

    // 4) raciocínio pesado
    if (raciocinio > 1_000_000 && saida > 0 && raciocinio / saida > 3) {
      recs.push({
        impacto: "medio",
        ferramenta: tool,
        titulo: `Raciocínio ${Math.round(raciocinio / saida)}× maior que a resposta`,
        detalhe: `${mil(raciocinio)} tokens de raciocínio para ${mil(saida)} de saída. Raciocínio é cobrado como saída.`,
        comoFazer:
          tool === "codex"
            ? 'Para tarefas simples, use model_reasoning_effort = "low" ou "medium" no ~/.codex/config.toml (ou /model).'
            : "Baixe o nível de raciocínio ou esforço nas tarefas simples.",
      });
    }

    // 5) subagentes (Claude Code)
    const sub = soma((u) => u.subagente);
    if (tool === "claude_code" && sub / req > 0.4 && req >= 100) {
      recs.push({
        impacto: "baixo",
        ferramenta: tool,
        titulo: `${pct(sub / req)} dos pedidos vêm de subagentes`,
        detalhe: "Subagentes são ótimos para explorar sem encher o contexto principal, mas cada um carrega o próprio contexto.",
        comoFazer: "Defina um modelo mais leve (model: haiku ou sonnet) nos subagentes de exploração em .claude/agents/.",
      });
    }
  }

  const ordem = { alto: 0, medio: 1, baixo: 2 };
  return recs.sort((a, b) => ordem[a.impacto] - ordem[b.impacto]);
}
