import { formatBrlMicros } from "@forja/core";
import { and, desc, eq, isNull, schema } from "@forja/db";
import { ArrowRight, AudioLines, LayoutGrid, PenLine } from "lucide-react";
import Link from "next/link";
import { Ignicao } from "@/components/oficina/boot";
import { Nucleo } from "@/components/oficina/nucleo";
import { Relogio } from "@/components/oficina/relogio";
import { listModelOptions } from "@/lib/models";
import { ASSISTANT_NAME, firstName, greeting } from "@/lib/persona";
import { getSession } from "@/lib/session";
import { resendVerification, signOut } from "../../(app)/actions";
import { comecarEscrevendo } from "../actions";

export const metadata = { title: "Central" };

const CONECTORES = [
  { type: "github", nome: "GitHub" },
  { type: "vercel", nome: "Vercel" },
  { type: "supabase", nome: "Supabase" },
  { type: "postgres", nome: "Postgres" },
];

/** Só mensagens conhecidas: texto livre na URL viraria um aviso "oficial" forjado. */
const AVISOS: Record<string, string> = {
  "limite-projetos": "Seu plano chegou ao limite de projetos ativos. Escolha um projeto existente ou arquive um no painel.",
};

export default async function CentralPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const aviso = AVISOS[(await searchParams).aviso ?? ""];
  const { db, org, plan, user } = await getSession();
  const [projetos, conectores, modelos] = await Promise.all([
    db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, org.id), isNull(schema.projects.archivedAt)))
      .orderBy(desc(schema.projects.createdAt))
      .limit(20),
    db.select({ type: schema.connectors.type }).from(schema.connectors).where(eq(schema.connectors.orgId, org.id)),
    listModelOptions(db, plan?.allowedTiers ?? []),
  ]);
  const ligados = new Set(conectores.map((c) => c.type));
  const liberados = modelos.filter((m) => m.allowed).length;

  const ignicao = [
    `acendendo a forja de ${org.name}`,
    `${liberados} modelos liberados no plano ${plan?.name ?? ""}`.trim(),
    `saldo ${formatBrlMicros(org.creditBalanceBrlMicros)}`,
    `${ASSISTANT_NAME} pronto para conversar`,
  ];

  const seletorProjeto = (
    <select
      name="projeto"
      defaultValue="nova"
      className="w-full rounded-md border border-aco-700 bg-aco-950/60 px-3 py-2 text-sm text-aco-100 focus:border-brasa focus:outline-none"
      aria-label="Projeto"
    >
      <option value="nova">Nova ideia (cria um projeto)</option>
      {projetos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Ignicao linhas={ignicao} />

      {/* faixa superior: leituras do painel */}
      <header className="flex items-center justify-between gap-4 border-b border-aco-800/80 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-aco-300 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display text-base font-extrabold tracking-[0.18em] text-aco-100">FORJA</span>
          <span className="hidden truncate sm:inline">· oficina {org.name}</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <span className="hidden sm:inline">
            <Relogio />
          </span>
          <Link href="/custos" className="text-palha hover:text-aco-100">
            {formatBrlMicros(org.creditBalanceBrlMicros)}
          </Link>
          <Link href="/projetos" className="inline-flex items-center gap-1.5 hover:text-aco-100">
            <LayoutGrid size={13} /> Painel
          </Link>
          <form action={signOut}>
            <button className="hover:text-aco-100">Sair</button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-8 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6 lg:pt-14">
        {/* saudação + modo call */}
        <section className="order-2 space-y-6 lg:order-1">
          <div className="anim-surgir">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-aco-300">
              {greeting()}, {firstName(user.name)}
            </p>
            <h1 className="mt-2 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-wide text-aco-100 sm:text-6xl">
              O que vamos
              <br />
              <span className="text-brasa">forjar</span> hoje?
            </h1>
          </div>

          <form action="/call" className="anim-surgir group rounded-xl border border-aco-700 bg-aco-850/70 p-5 backdrop-blur [animation-delay:120ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold uppercase tracking-wide text-aco-100">Entrar na call</p>
                <p className="mt-1 text-sm text-aco-300">
                  Fale com {ASSISTANT_NAME} como numa reunião. Ele faz perguntas, debate as ideias e monta a especificação enquanto vocês conversam.
                </p>
              </div>
              <AudioLines className="mt-1 shrink-0 text-brasa" size={22} />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {seletorProjeto}
              <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-brasa px-4 py-2 text-sm font-semibold text-aco-950 transition hover:bg-brasa-claro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-palha">
                Entrar <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </section>

        {/* o núcleo */}
        <div className="order-1 flex justify-center lg:order-2">
          <Nucleo tamanho={300} rotulo="Núcleo da forja em repouso" className="sm:hidden" />
          <Nucleo tamanho={380} rotulo="Núcleo da forja em repouso" className="hidden sm:grid" />
        </div>

        {/* modo escrever */}
        <section className="order-3 space-y-4">
          {aviso ? <p className="rounded-md border border-brasa/40 bg-brasa/10 px-3 py-2 text-sm text-brasa-claro">{aviso}</p> : null}
          {!user.emailVerified ? (
            <form action={resendVerification} className="rounded-md border border-palha/40 bg-palha/10 px-3 py-2 text-sm text-palha">
              Confirme seu e-mail (<b>{user.email}</b>) para liberar os modelos de IA.{" "}
              <button className="font-semibold underline underline-offset-2">Reenviar e-mail</button>
            </form>
          ) : null}
          <form action={comecarEscrevendo} className="anim-surgir rounded-xl border border-aco-700 bg-aco-850/70 p-5 backdrop-blur [animation-delay:220ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold uppercase tracking-wide text-aco-100">Escrever</p>
                <p className="mt-1 text-sm text-aco-300">Descreva o pedido e escolha o modelo na conversa.</p>
              </div>
              <PenLine className="mt-1 shrink-0 text-palha" size={20} />
            </div>
            <textarea
              name="pedido"
              required
              rows={4}
              placeholder="Ex.: um sistema de agendamento para clínica, com lembrete no WhatsApp e painel do dono…"
              className="mt-4 w-full resize-none rounded-md border border-aco-700 bg-aco-950/60 px-3 py-2 text-sm text-aco-100 placeholder:text-aco-400 focus:border-palha focus:outline-none"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              {seletorProjeto}
              <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-palha/60 px-4 py-2 text-sm font-semibold text-palha transition hover:bg-palha hover:text-aco-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-palha">
                Começar <ArrowRight size={15} />
              </button>
            </div>
          </form>

          <div className="anim-surgir grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-aco-800 bg-aco-800 font-mono text-[11px] [animation-delay:320ms]">
            <div className="bg-aco-900/90 p-3">
              <p className="uppercase tracking-[0.14em] text-aco-400">Conectores</p>
              <ul className="mt-2 space-y-1">
                {CONECTORES.map((c) => (
                  <li key={c.type} className="flex items-center gap-2 text-aco-100">
                    <span className={`h-1.5 w-1.5 rounded-full ${ligados.has(c.type) ? "bg-palha" : "bg-aco-500"}`} />
                    {c.nome}
                    <span className="text-aco-400">{ligados.has(c.type) ? "ligado" : "—"}</span>
                  </li>
                ))}
              </ul>
              <Link href="/conectores" className="mt-2 inline-block text-aco-300 underline-offset-2 hover:text-aco-100 hover:underline">
                gerenciar
              </Link>
            </div>
            <div className="bg-aco-900/90 p-3">
              <p className="uppercase tracking-[0.14em] text-aco-400">Projetos recentes</p>
              <ul className="mt-2 space-y-1">
                {projetos.slice(0, 4).map((p) => (
                  <li key={p.id} className="truncate">
                    <Link href={`/projetos/${p.id}`} className="text-aco-100 hover:text-palha">
                      {p.name}
                    </Link>
                  </li>
                ))}
                {projetos.length === 0 ? <li className="text-aco-400">nenhum ainda</li> : null}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
