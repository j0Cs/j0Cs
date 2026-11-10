import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem otimista: sem cookie de sessão → tela de login. A validação de verdade
 * (sessão no banco, organização, papel) acontece em lib/session.ts em cada página/ação.
 */
// /api/cron é protegida pelo CRON_SECRET (a Vercel envia no cabeçalho) e o webhook do Stripe pela
// assinatura do evento (STRIPE_WEBHOOK_SECRET), não por sessão. /api/otlp recebe a telemetria dos
// assistentes de IA, autenticada pelo token de envio de cada fonte. /precos é a página pública de preços.
const PUBLIC = [
  "/", // site (quem já entrou é levado à central pela própria página)
  "/icon.svg",
  "/entrar",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/convite",
  "/precos",
  "/status",
  "/suporte",
  "/api/auth",
  "/api/cron",
  "/api/stripe/webhook",
  "/api/otlp",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "forja" })) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Não autenticado.", { status: 401 });
  const url = new URL("/entrar", request.url);
  if (pathname !== "/" && pathname !== "/central") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
