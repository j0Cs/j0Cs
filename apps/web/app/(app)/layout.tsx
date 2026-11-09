import { bloqueioDaOrg, CARENCIA_INADIMPLENCIA_DIAS, diasRestantesDoTeste, formatBrlMicros, TRIAL_PLAN_ID } from "@forja/core";
import { Notice } from "@forja/ui";
import { Shell } from "@forja/ui/shell";
import { Bot, CreditCard, FolderKanban, Gauge, LogOut, Orbit, Plug, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { resendVerification, signOut } from "./actions";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { org, plan, user } = await getSession();
  const bloqueio = bloqueioDaOrg(org);
  const diasDeTeste = org.planId === TRIAL_PLAN_ID ? diasRestantesDoTeste(org.trialEndsAt) : null;
  const diasDeCarencia = org.pastDueSince
    ? Math.max(0, CARENCIA_INADIMPLENCIA_DIAS - Math.floor((Date.now() - org.pastDueSince.getTime()) / 86_400_000))
    : null;
  return (
    <Shell
      brand={APP_NAME}
      tagline={org.name}
      nav={[
        { href: "/central", label: "Central", icon: <Orbit size={16} /> },
        { href: "/projetos", label: "Projetos", icon: <FolderKanban size={16} /> },
        { href: "/agente", label: "Agente", icon: <Bot size={16} /> },
        { href: "/conectores", label: "Conectores", icon: <Plug size={16} /> },
        { href: "/custos", label: "Custos e uso", icon: <Gauge size={16} /> },
        { href: "/equipe", label: "Equipe", icon: <Users size={16} /> },
        { href: "/plano", label: "Plano e cobrança", icon: <CreditCard size={16} /> },
      ]}
      footer={
        <div className="space-y-3">
          <Link href="/custos" className="block hover:text-zinc-200">
            <span className="block text-[11px] uppercase tracking-wide">Saldo de créditos</span>
            <span className="text-base font-semibold text-white tabular-nums">{formatBrlMicros(org.creditBalanceBrlMicros)}</span>
            <span className="block">Plano {plan?.name ?? "—"}</span>
          </Link>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
            <span className="min-w-0 truncate" title={user.email}>
              {user.name}
            </span>
            <form action={signOut}>
              <button className="inline-flex items-center gap-1 text-zinc-400 hover:text-white" aria-label="Sair">
                <LogOut size={14} /> Sair
              </button>
            </form>
          </div>
        </div>
      }
    >
      {bloqueio ? (
        <div className="mb-4">
          <Notice tone="red">
            {bloqueio.message}{" "}
            {bloqueio.code !== "org_inactive" ? (
              <Link href="/plano" className="font-medium underline">
                Ver planos e pagamentos
              </Link>
            ) : null}
          </Notice>
        </div>
      ) : diasDeCarencia !== null ? (
        <div className="mb-4">
          <Notice>
            A cobrança da assinatura não passou. Regularize {diasDeCarencia <= 1 ? "até amanhã" : `em até ${diasDeCarencia} dias`} para o uso
            não ser pausado.{" "}
            <Link href="/plano" className="font-medium underline">
              Pagar agora
            </Link>
          </Notice>
        </div>
      ) : diasDeTeste !== null && diasDeTeste <= 3 ? (
        <div className="mb-4">
          <Notice>
            {diasDeTeste === 0 ? "Seu teste grátis termina hoje." : `Seu teste grátis termina em ${diasDeTeste} dia(s).`} Assine para continuar
            sem parar.{" "}
            <Link href="/plano#planos" className="font-medium underline">
              Ver planos
            </Link>
          </Notice>
        </div>
      ) : null}
      {!user.emailVerified ? (
        <div className="mb-4">
          <Notice>
            <form action={resendVerification} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Confirme seu e-mail (<b>{user.email}</b>) para usar os modelos de IA.
              </span>
              <button className="text-sm font-medium underline">Reenviar e-mail</button>
            </form>
          </Notice>
        </div>
      ) : null}
      {children}
    </Shell>
  );
}
