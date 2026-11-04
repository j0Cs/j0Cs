import { Shell } from "@forja/ui/shell";
import { BadgePercent, Building2, Cpu, KeyRound, LayoutDashboard, Settings } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata: Metadata = {
  title: { default: `Admin · ${APP_NAME}`, template: `%s · Admin ${APP_NAME}` },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <Shell
          brand={APP_NAME}
          tagline="Painel do dono"
          nav={[
            { href: "/", label: "Visão geral", icon: <LayoutDashboard size={16} /> },
            { href: "/clientes", label: "Clientes", icon: <Building2 size={16} /> },
            { href: "/modelos", label: "Modelos e preços", icon: <Cpu size={16} /> },
            { href: "/chaves", label: "Chaves de API", icon: <KeyRound size={16} /> },
            { href: "/planos", label: "Planos e margem", icon: <BadgePercent size={16} /> },
            { href: "/configuracoes", label: "Câmbio e taxas", icon: <Settings size={16} /> },
          ]}
          footer={<span>Acesso restrito à equipe da plataforma.</span>}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
