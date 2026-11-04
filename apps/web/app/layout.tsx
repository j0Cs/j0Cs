import { formatBrlMicros } from "@forja/core";
import { Shell } from "@forja/ui/shell";
import { CreditCard, FolderKanban, Gauge, Plug } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Crie sistemas com os melhores modelos de IA em um só lugar.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { org, plan } = await getSession();
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <Shell
          brand={APP_NAME}
          tagline={org.name}
          nav={[
            { href: "/projetos", label: "Projetos", icon: <FolderKanban size={16} /> },
            { href: "/conectores", label: "Conectores", icon: <Plug size={16} /> },
            { href: "/custos", label: "Custos e uso", icon: <Gauge size={16} /> },
            { href: "/plano", label: "Plano e modelos", icon: <CreditCard size={16} /> },
          ]}
          footer={
            <Link href="/custos" className="block hover:text-zinc-200">
              <span className="block text-[11px] uppercase tracking-wide">Saldo de créditos</span>
              <span className="text-base font-semibold text-white tabular-nums">{formatBrlMicros(org.creditBalanceBrlMicros)}</span>
              <span className="block">Plano {plan?.name ?? "—"}</span>
            </Link>
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
