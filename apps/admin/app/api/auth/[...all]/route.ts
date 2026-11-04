import { getAdminAuth } from "@forja/auth";

export const runtime = "nodejs";

/**
 * Só GET. Login, 2FA e sessão do painel passam pelas server actions (com limites próprios);
 * as rotas POST do Better Auth fariam o mesmo sem esses limites.
 */
export const GET = (request: Request) => getAdminAuth().handler(request);
export const POST = () => new Response("Não encontrado.", { status: 404 });
