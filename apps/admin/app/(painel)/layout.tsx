import { Shell } from "@forja/ui/shell";
import { BadgePercent, Building2, Cpu, KeyRound, LayoutDashboard, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/admin";
import { signOutAction } from "../(acesso)/actions";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return (
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
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate" title={user.email}>
            {user.email}
          </span>
          <form action={signOutAction}>
            <button className="inline-flex items-center gap-1 text-zinc-400 hover:text-white">
              <LogOut size={14} /> Sair
            </button>
          </form>
        </div>
      }
    >
      {children}
    </Shell>
  );
}
