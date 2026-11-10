"use client";

import { cx } from "@forja/ui";
import { useEffect, useRef, useState } from "react";

/**
 * A bancada da abertura: alterna entre as duas formas de usar a Forja. "Suas contas" mostra o
 * medidor de tokens das IAs que o cliente já paga; "A Forja constrói" mostra um pedido andando
 * pelas etapas. Os números são de exemplo. Com movimento reduzido, nada troca sozinho.
 */
const CONTAS = [
  { nome: "Claude", via: "Claude Code", tokens: 48.2, custo: "US$ 31,40", cor: "bg-brasa", parte: 0.92 },
  { nome: "ChatGPT", via: "Codex", tokens: 21.7, custo: "US$ 12,10", cor: "bg-revenido", parte: 0.46 },
  { nome: "Gemini", via: "Gemini CLI", tokens: 9.4, custo: "US$ 2,80", cor: "bg-pavao", parte: 0.22 },
  { nome: "Grok", via: "Grok Build", tokens: 3.1, custo: "US$ 1,95", cor: "bg-bronze", parte: 0.1 },
];
const PASSOS = [
  ["Plano", "5 passos: horários, página, lembrete, painel, testes", "bg-palha"],
  ["Código", "7 arquivos alterados · diff pronto para aprovar", "bg-bronze"],
  ["Pull request", "aberto no GitHub da clínica", "bg-pavao"],
  ["Revisão de QA", "seguir com ajustes · 2 achados", "bg-revenido"],
  ["Preview", "publicado na Vercel · link na conversa", "bg-brasa"],
] as const;
const PEDIDO = "Crie uma página de agendamento para a clínica, com lembrete por WhatsApp e painel do dono.";
const ABAS = [
  { id: "contas", nome: "Suas contas de IA" },
  { id: "forja", nome: "A Forja constrói" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export function Bancada() {
  const [aba, setAba] = useState<Aba>("contas");
  const [tique, setTique] = useState(0);
  const [parado, setParado] = useState(false);
  const semMovimento = useRef(false);

  useEffect(() => {
    semMovimento.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semMovimento.current) {
      setTique(99);
      return;
    }
    const id = window.setInterval(() => setTique((t) => t + 1), 900);
    return () => window.clearInterval(id);
  }, []);

  // troca de aba sozinha a cada ciclo, a não ser que a pessoa esteja com o ponteiro ou o foco aqui
  useEffect(() => {
    if (semMovimento.current || parado) return;
    if (tique > 0 && tique % 11 === 0) {
      setAba((a) => (a === "contas" ? "forja" : "contas"));
      setTique(0);
    }
  }, [tique, parado]);

  const escolher = (a: Aba) => {
    setAba(a);
    if (!semMovimento.current) setTique(0);
  };
  const feitos = Math.min(PASSOS.length, Math.max(0, tique - 2));
  const digitado = semMovimento.current ? PEDIDO : PEDIDO.slice(0, Math.min(PEDIDO.length, tique * 34));
  const gasto = (0.11 + Math.min(feitos, 5) * 0.146).toFixed(2).replace(".", ",");

  return (
    <figure
      className="overflow-hidden rounded-lg border border-aco-700 bg-aco-850/85 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
    >
      <div role="tablist" aria-label="Duas formas de usar a Forja" className="grid grid-cols-2 border-b border-aco-700 font-mono text-[11px] uppercase tracking-[0.16em]">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            type="button"
            aria-selected={aba === a.id}
            onClick={() => escolher(a.id)}
            className={cx(
              "border-b-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-revenido",
              aba === a.id ? "border-brasa bg-aco-900/60 text-aco-100" : "border-transparent text-aco-300 hover:text-aco-100",
            )}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "contas" ? (
        <div key="contas" role="tabpanel" className="troca-de-painel space-y-4 p-5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-aco-300">Tokens nos últimos 30 dias · exemplo</p>
            <p className="tabular-nums text-aco-100">
              <b>82,4 mi</b> <span className="text-aco-300">· US$ 48,25</span>
            </p>
          </div>
          <ul className="space-y-3">
            {CONTAS.map((c, i) => (
              <li key={c.nome}>
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    <span className="font-medium text-aco-100">{c.nome}</span> <span className="text-aco-300">· {c.via}</span>
                  </span>
                  <span className="tabular-nums text-aco-300">
                    {c.tokens.toFixed(1).replace(".", ",")} mi · {c.custo}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-aco-800">
                  <div className={cx("barra-de-uso h-full rounded-full", c.cor)} style={{ transform: `scaleX(${tique > i ? c.parte : 0})`, transitionDelay: `${i * 90}ms` }} />
                </div>
              </li>
            ))}
          </ul>
          <p
            className={cx("passo-da-tarefa rounded-md border border-palha/40 bg-palha/10 px-4 py-3 text-palha")}
            data-feito={tique >= 5 ? "sim" : "nao"}
          >
            <b className="font-semibold">Como gastar menos:</b> só 41% do contexto do Claude Code vem do cache. Fixar as instruções no começo da sessão corta cerca de 18% do
            gasto.
          </p>
        </div>
      ) : (
        <div key="forja" role="tabpanel" className="troca-de-painel space-y-4 p-5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-aco-300">Tarefa do agente · exemplo</p>
            <p className="tabular-nums text-palha">R$ {gasto} de R$ 20,00</p>
          </div>
          <p className={cx("min-h-[4.5rem] rounded-md border border-aco-700 bg-aco-950/70 px-4 py-3 text-aco-100", digitado.length < PEDIDO.length && "cursor-de-texto")}>
            “{digitado}
            {digitado.length === PEDIDO.length ? "”" : ""}
          </p>
          <ol className="space-y-2.5">
            {PASSOS.map(([nome, detalhe, cor], i) => (
              <li key={nome} className="passo-da-tarefa flex items-start gap-3" data-feito={i < feitos ? "sim" : "nao"}>
                <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", cor)} />
                <span>
                  <span className="font-medium text-aco-100">{nome}</span> <span className="text-aco-300">· {detalhe}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  );
}
