import type { ChatMessage } from "@forja/core";
import { runChat, type Effort } from "@forja/core/server";
import { createGatewayStore, type Db } from "@forja/db";

/** Executa uma chamada pelo gateway e devolve o texto completo (sem streaming para o cliente). */
export async function collectChat(
  db: Db,
  req: {
    orgId: string;
    userId: string;
    projectId?: string | null;
    conversationId?: string | null;
    modelId: string;
    system: string;
    messages: ChatMessage[];
    effort?: Effort;
  },
) {
  let text = "";
  let chargeBrlMicros = 0;
  let error: string | null = null;
  for await (const ev of runChat({ store: createGatewayStore(db) }, req)) {
    if (ev.type === "text") text += ev.text;
    else if (ev.type === "done") chargeBrlMicros = ev.chargeBrlMicros;
    else if (ev.type === "error") error = ev.message;
  }
  return { text, chargeBrlMicros, error };
}
