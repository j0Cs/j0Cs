import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";

/** Área imersiva (central de comando e chamada): tela cheia, sem a barra lateral do painel. */
export default async function OficinaLayout({ children }: { children: ReactNode }) {
  const { org } = await getSession();
  if (!org.onboardedAt) redirect("/boas-vindas");
  return (
    <div className="oficina relative min-h-dvh overflow-hidden">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}
