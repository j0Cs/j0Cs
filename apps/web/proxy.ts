import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem otimista: sem cookie de sessão → tela de login. A validação de verdade
 * (sessão no banco, organização, papel) acontece em lib/session.ts em cada página/ação.
 */
const PUBLIC = ["/entrar", "/cadastro", "/recuperar-senha", "/redefinir-senha", "/convite", "/api/auth"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "forja" })) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Não autenticado.", { status: 401 });
  const url = new URL("/entrar", request.url);
  if (pathname !== "/" && pathname !== "/projetos") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
