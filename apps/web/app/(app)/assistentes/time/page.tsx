import { arquivosDoTime, FERRAMENTAS_DO_TIME, ORDEM_DAS_PERSONAS, PERSONAS, type FerramentaDoTime } from "@forja/agent";
import { Badge, buttonClass, Card, CardHeader, Notice, PageHeader } from "@forja/ui";
import Link from "next/link";
import { BotaoCopiar } from "@/components/markdown";

export const metadata = { title: "Time de especialistas" };

export default function TimePage() {
  const ferramentas = Object.keys(FERRAMENTAS_DO_TIME) as FerramentaDoTime[];
  return (
    <>
      <PageHeader
        title="Time de especialistas"
        description="Dédalo, Brontes, Argos e Cérbero: os quatro especialistas que as IAs da Forja seguem na auditoria e na revisão de pull requests. Instale o mesmo time no seu repositório para usar no Claude Code, no Codex, no Gemini CLI ou no Grok Build com a sua própria assinatura."
        actions={
          <Link href="/projetos" className={buttonClass("brand", "sm")}>
            Instalar num repositório
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {ORDEM_DAS_PERSONAS.map((p) => (
          <Card key={p} className="p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-zinc-900">{PERSONAS[p].apelido} <span className="text-sm font-normal text-zinc-500">· o {PERSONAS[p].oficio}</span></p>
                <p className="text-xs text-zinc-500">{PERSONAS[p].modo === "revisa" ? "Analisa e recomenda (não altera arquivos)" : "Implementa mudanças"}</p>
              </div>
              
            </div>
            <p className="text-sm text-zinc-800">{PERSONAS[p].faz}</p>
            <p className="mt-2 text-sm text-zinc-600">
              <b className="font-medium text-zinc-900">O que você recebe:</b> {PERSONAS[p].entrega}
            </p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">Ver as instruções</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">{PERSONAS[p].instrucoes}</pre>
            </details>
          </Card>
        ))}
      </div>

      <Notice tone="blue">
        <b>Como funciona com a sua assinatura:</b> o assistente roda na sua máquina, com a sua conta (Pro, Max, Plus, Google AI ou SuperGrok). A Forja só entrega os
        arquivos do time e, se você quiser, recebe os números de uso para mostrar onde economizar. Login de assinatura dentro de outros apps não é permitido pelos
        termos da Anthropic, da Google e da OpenAI, e a Forja não pede nem guarda essas credenciais.
      </Notice>

      <div className="mt-6 space-y-6">
        {ferramentas.map((f) => {
          const arquivos = arquivosDoTime([f]);
          return (
            <Card key={f}>
              <CardHeader title={FERRAMENTAS_DO_TIME[f].nome} description={`O que entra no repositório: ${FERRAMENTAS_DO_TIME[f].arquivos}.`} />
              <ul className="divide-y divide-zinc-100">
                {arquivos.map((a) => (
                  <li key={a.path} className="px-5 py-3">
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-mono text-xs text-zinc-800">{a.path}</span>
                        {a.bloco ? <span className="shrink-0 text-xs text-zinc-500">bloco somado ao arquivo existente</span> : null}
                      </summary>
                      <div className="mt-2 flex justify-end">
                        <BotaoCopiar texto={a.content} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100" />
                      </div>
                      <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">{a.content}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
