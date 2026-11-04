import type { ReactNode } from "react";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-lg font-semibold text-white">{APP_NAME}</p>
        <p className="text-xs text-zinc-400">Painel do dono · acesso restrito</p>
      </div>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  );
}
