import Link from "next/link";
import type { ReactNode } from "react";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-bold text-white">{APP_NAME.slice(0, 1)}</span>
        <span className="text-lg font-semibold">{APP_NAME}</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-zinc-500">
        Claude, GPT, Gemini e Grok num só lugar, cobrado em reais.{" "}
        <Link href="/precos" className="font-medium text-zinc-700 underline">
          Ver planos e preços
        </Link>
      </p>
    </div>
  );
}
