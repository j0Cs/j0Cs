import type { Metadata } from "next";
import type { ReactNode } from "react";
import { plexMono, plexSans, shoulders } from "./fonts";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/**
 * Toda página depende da sessão (cookies) e do banco: nada pode ser pré-renderizado no build.
 * Sem isto, o build tenta gerar páginas estáticas e falha onde não há segredos (prévias).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Crie sistemas com os melhores modelos de IA em um só lugar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${shoulders.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
