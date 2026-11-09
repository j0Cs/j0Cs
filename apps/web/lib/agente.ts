import { executarTarefa, githubApp, type GithubApp } from "@forja/agent";
import type { Db } from "@forja/db";
import type { ModelOption } from "./models";

/** Modelos que executam tarefas de agente (com ferramentas): Claude, GPT e Grok. */
export const PROVEDORES_DO_AGENTE = new Set(["anthropic", "openai", "xai"]);
export const PREFERIDOS_DO_AGENTE = ["claude-sonnet-5-5", "claude-opus-5-5", "gpt-6.1-sol", "claude-haiku-5-5", "grok-4.7"];

export const modelosDoAgente = (modelos: ModelOption[]) => modelos.filter((m) => PROVEDORES_DO_AGENTE.has(m.providerId));

/**
 * Roda (ou retoma) a tarefa até o orçamento de tempo da função. Chamado depois da resposta
 * (after/waitUntil): a tela consulta o andamento e retoma se a execução parar no meio.
 */
export async function rodarTarefa(db: Db, gh: GithubApp, taskId: string) {
  try {
    await executarTarefa(db, gh, taskId, { orcamentoMs: 250_000 });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "tarefa do agente falhou", taskId, err: String(err) }));
  }
}

export { githubApp };
