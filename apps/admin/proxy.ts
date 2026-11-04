import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção do painel do dono.
 *
 * ⚠️ PROVISÓRIO: HTTP Basic com ADMIN_USER/ADMIN_PASSWORD. Na Sprint 1 vira login
 * com 2FA obrigatório + allowlist de IP + usuários "staff" no banco.
 * Falha fechada: sem senha configurada, ninguém entra.
 */
export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!user || !password) {
    return new NextResponse("Painel bloqueado: defina ADMIN_USER e ADMIN_PASSWORD.", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const sep = decoded.indexOf(":");
    if (safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
      return NextResponse.next();
    }
  }
  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="admin", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
