"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

/** Texto puro de um nó React (para copiar o código destacado). */
function textoDe(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join("");
  if (typeof n === "object" && "props" in n) return textoDe((n as { props: { children?: ReactNode } }).props.children);
  return "";
}

export function BotaoCopiar({ texto, rotulo = "Copiar", className }: { texto: string; rotulo?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
      className={className ?? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100"}
      aria-label={rotulo}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? "Copiado" : rotulo}
    </button>
  );
}

function BlocoDeCodigo({ children, className }: { children?: ReactNode; className?: string }) {
  const linguagem = /language-([\w-]+)/.exec(className ?? "")?.[1];
  const texto = textoDe(children).replace(/\n$/, "");
  return (
    <div className="my-2 overflow-hidden rounded-lg bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1">
        <span className="font-mono text-[11px] text-zinc-400">{linguagem ?? "código"}</span>
        <BotaoCopiar texto={texto} />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-5">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Markdown das respostas (GFM: tabelas, listas de tarefa) com código destacado e botão de copiar.
 * HTML cru do modelo NÃO é renderizado (sem rehype-raw) e links perigosos são neutralizados.
 */
export function Markdown({ texto }: { texto: string }) {
  return (
    <div className="markdown space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const bloco = /language-|hljs/.test(className ?? "") || textoDe(children).includes("\n");
            return bloco ? (
              <BlocoDeCodigo className={className}>{children}</BlocoDeCodigo>
            ) : (
              <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium underline underline-offset-2">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="my-2 w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-zinc-300 bg-zinc-50 px-2 py-1 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-zinc-300 px-2 py-1 align-top">{children}</td>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <p className="text-base font-semibold">{children}</p>,
          h2: ({ children }) => <p className="text-[15px] font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600">{children}</blockquote>,
        }}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
}
