import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Painel do dono:
 * 1. Allowlist de IP (ADMIN_IP_ALLOWLIST="1.2.3.4,5.6.7.8"); vazio = sem restrição de IP.
 * 2. Sem cookie de sessão → /entrar. A validação completa (staff + 2FA) fica em lib/admin.ts.
 */
const PUBLIC = ["/entrar", "/api/auth"];

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
}

export function proxy(request: NextRequest) {
  const allow = (process.env.ADMIN_IP_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length && !allow.includes(clientIp(request))) {
    return new NextResponse("Acesso não permitido a partir deste endereço.", { status: 403 });
  }

  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "forja-admin" })) return NextResponse.next();
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
