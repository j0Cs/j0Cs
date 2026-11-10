"use client";

import { BotaoCopiar, Markdown } from "@/components/markdown";
import { formatBrlMicros, TIER_LABELS } from "@forja/core";
import { Button, cx, inputBaseClass, inputClass } from "@forja/ui";
import { ArrowUp, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usageMeta } from "@/lib/format";
import type { ModelOption } from "@/lib/models";

/** Especialistas do time Forja (as instruções ficam no servidor). */
const PAPEIS = [
  { id: "", label: "Assistente" },
  { id: "dev_senior", label: "Dédalo · Dev Sênior" },
  { id: "dev_pleno", label: "Brontes · Dev Pleno" },
  { id: "qa_pleno", label: "Argos · QA Pleno" },
  { id: "seguranca_pleno", label: "Cérbero · Cyber Security" },
];

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: string | null;
  meta?: string | null;
  error?: boolean;
}

type StreamEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | {
      type: "done";
      servedModel: string;
      refused: boolean;
      chargeBrlMicros: number;
      balanceBrlMicros: number;
      usage: { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number };
    }
  | { type: "error"; code: string; message: string };

const EFFORTS = [
  { id: "low", label: "Rápido" },
  { id: "medium", label: "Equilibrado" },
  { id: "high", label: "Profundo" },
  { id: "xhigh", label: "Máximo" },
] as const;

export function Chat(props: {
  projectId: string;
  conversationId: string | null;
  initialMessages: Msg[];
  models: ModelOption[];
  defaultModelId: string;
  /** A última mensagem (vinda da Central) ainda não tem resposta: pede ao modelo uma vez. */
  responderPendente?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(props.defaultModelId);
  const [effort, setEffort] = useState<(typeof EFFORTS)[number]["id"]>("high");
  const [persona, setPersona] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef(props.conversationId);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // bloco com chaves: scrollIntoView devolve Promise em navegadores novos, e o
    // useEffect não pode retornar nada além da função de limpeza.
    void bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const model = props.models.find((m) => m.id === modelId);
  const byTier = Object.entries(TIER_LABELS).map(([tier, label]) => ({
    label,
    items: props.models.filter((m) => m.tier === tier),
  }));

  const autoSent = useRef(false);
  useEffect(() => {
    if (props.responderPendente && !autoSent.current) {
      autoSent.current = true;
      window.history.replaceState(null, "", `/projetos/${props.projectId}?c=${props.conversationId}`);
      void send(undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(override?: string, responderUltima = false) {
    const text = (override ?? input).trim();
    if ((!text && !responderUltima) || busy) return;
    setInput("");
    setBusy(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      ...(responderUltima ? [] : [{ id: crypto.randomUUID(), role: "user" as const, content: text }]),
      { id: assistantId, role: "assistant", content: "", modelId },
    ]);
    const patch = (fn: (msg: Msg) => Msg) =>
      setMessages((all) => all.map((msg) => (msg.id === assistantId ? fn(msg) : msg)));

    abort.current = new AbortController();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: props.projectId,
          conversationId: conversationId.current,
          modelId,
          effort,
          persona: persona || undefined,
          message: responderUltima ? undefined : text,
          responderUltima,
        }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Erro ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "conversation" && !conversationId.current) {
            conversationId.current = ev.id;
            window.history.replaceState(null, "", `/projetos/${props.projectId}?c=${ev.id}`);
          } else if (ev.type === "text") {
            patch((msg) => ({ ...msg, content: msg.content + ev.text }));
          } else if (ev.type === "done") {
            patch((msg) => ({
              ...msg,
              content: ev.refused && !msg.content ? "O modelo recusou esta solicitação." : msg.content,
              meta: usageMeta(ev.chargeBrlMicros, ev.usage),
            }));
          } else if (ev.type === "error") {
            patch((msg) => ({ ...msg, content: msg.content || ev.message, error: true }));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        patch((msg) => ({ ...msg, content: msg.content || (err as Error).message, error: true }));
      }
    } finally {
      setBusy(false);
      abort.current = null;
      router.refresh(); // atualiza saldo e lista de conversas
    }
  }

  return (
    <section className="flex h-[75vh] min-h-[480px] min-w-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm lg:h-[calc(100vh-10rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={cx(inputBaseClass, "w-auto py-1.5")}
          aria-label="Modelo"
        >
          {byTier.map((group) =>
            group.items.length ? (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.allowed}>
                    {m.displayName}
                    {m.allowed ? "" : " — requer upgrade"}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          className={cx(inputBaseClass, "w-auto py-1.5 text-xs")}
          aria-label="Falar com"
          title="Especialista do time Forja que responde"
        >
          {PAPEIS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-zinc-200 p-0.5" role="radiogroup" aria-label="Profundidade">
          {EFFORTS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEffort(e.id)}
              className={cx("rounded-md px-2.5 py-1 text-xs", effort === e.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")}
            >
              {e.label}
            </button>
          ))}
        </div>
        {model ? (
          <span className="ml-auto text-xs text-zinc-500">
            {formatBrlMicros(model.inputBrlPerMTok * 1e6)} / {formatBrlMicros(model.outputBrlPerMTok * 1e6)} por 1M tokens (entrada/saída)
          </span>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md py-16 text-center text-sm text-zinc-500">
            <p className="font-medium text-zinc-800">Comece descrevendo o que você quer construir.</p>
            <p className="mt-1">Troque de modelo a qualquer momento — o custo de cada resposta aparece logo abaixo dela.</p>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user" ? "bg-zinc-900 text-white" : m.error ? "bg-red-50 text-red-800" : "bg-zinc-100 text-zinc-900",
              )}
            >
              {m.role === "assistant" && m.modelId ? (
                <p className="mb-1 text-[11px] font-medium text-zinc-500">
                  {props.models.find((x) => x.id === m.modelId)?.displayName ?? m.modelId}
                </p>
              ) : null}
              {m.content ? (
                m.role === "assistant" && !m.error ? (
                  <Markdown texto={m.content} />
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )
              ) : (
                <span className="animate-pulse text-zinc-400">pensando…</span>
              )}
              {m.meta || (m.role === "assistant" && m.content && !m.error) ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-500">{m.meta}</p>
                  {m.role === "assistant" && m.content && !m.error ? (
                    <BotaoCopiar
                      texto={m.content}
                      rotulo="Copiar resposta"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-zinc-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Descreva a tarefa… (Enter envia, Shift+Enter quebra linha)"
          className={cx(inputClass, "resize-none")}
        />
        {busy ? (
          <Button type="button" variant="secondary" onClick={() => abort.current?.abort()} aria-label="Parar">
            <Square size={16} />
          </Button>
        ) : (
          <Button type="submit" variant="brand" disabled={!input.trim() || !model?.allowed} aria-label="Enviar">
            <ArrowUp size={16} />
          </Button>
        )}
      </form>
    </section>
  );
}
