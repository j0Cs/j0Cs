import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata: Metadata = {
  title: { default: `Admin · ${APP_NAME}`, template: `%s · Admin ${APP_NAME}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
