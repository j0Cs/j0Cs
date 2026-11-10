"use client";

import { Button, inputClass, Notice } from "@forja/ui";
import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { criarFonteAction } from "./actions";

type Configuracao = { arquivo: string; linguagem: string; conteudo: string; observacao: string };

export function ConectarFerramenta({ tool, nome }: { tool: string; nome: string }) {
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (config) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-600">
          Cole em <code className="rounded bg-zinc-100 px-1">{config.arquivo}</code>. O token aparece só agora.
        </p>
        <div className="relative">
          <pre className="max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 pr-12 text-xs leading-5 text-zinc-100">{config.conteudo}</pre>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(config.conteudo);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="absolute right-2 top-2 rounded-md bg-zinc-800 p-1.5 text-zinc-200 hover:bg-zinc-700"
            aria-label="Copiar a configuração"
          >
            {copiado ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-xs text-zinc-500">{config.observacao}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Nome (ex.: ${nome} do notebook)`} maxLength={80} className={inputClass} />
      <Button
        variant="secondary"
        size="sm"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await criarFonteAction(tool, label);
            if (r.erro || !r.config) setErro(r.erro ?? "Não consegui gerar a configuração.");
            else setConfig(r.config);
          })
        }
      >
        {ocupado ? "Gerando…" : "Gerar configuração"}
      </Button>
      {erro ? <Notice tone="red">{erro}</Notice> : null}
    </div>
  );
}
