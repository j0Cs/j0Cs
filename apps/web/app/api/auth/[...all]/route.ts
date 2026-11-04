import { getWebAuth } from "@forja/auth";

export const runtime = "nodejs";

/**
 * Só GET: links dos e-mails (link mágico, confirmação, redefinição de senha) e o retorno do
 * GitHub. Login, cadastro e envios de e-mail passam pelas server actions, que aplicam os nossos
 * limites por IP e por e-mail; as rotas POST do Better Auth fariam o mesmo sem esses limites.
 */
export const GET = (request: Request) => getWebAuth().handler(request);
export const POST = () => new Response("Não encontrado.", { status: 404 });
