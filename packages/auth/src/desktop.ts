/**
 * Login do app desktop pelo navegador.
 *
 * 1. O app abre o navegador em /desktop/autorizar?estado=… (o estado é sorteado pelo app).
 * 2. A pessoa, já logada no navegador, confirma. O servidor cria um código de uso único (3 minutos)
 *    e o navegador abre forja://entrar?codigo=…&estado=….
 * 3. O app confere o estado e troca o código por uma sessão própria (POST /api/desktop/sessao, que repassa ao endpoint deste plugin).
 *
 * A sessão do app é separada da do navegador: sair de um não derruba o outro. O banco guarda só o
 * SHA-256 do código.
 */
import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";

export const VALIDADE_DO_CODIGO_MIN = 3;
/** Cabeçalho que o app manda na troca. Um formulário de outro site não consegue enviar. */
export const CABECALHO_DESKTOP = "x-forja-desktop";

const ESTADO = /^[A-Za-z0-9_-]{32,64}$/;
export const estadoValido = (v: unknown): v is string => typeof v === "string" && ESTADO.test(v);

const chave = (codigo: string) => `desktop-login:${createHash("sha256").update(codigo).digest("hex")}`;

/** Link que o navegador abre para devolver o código ao app. */
export function linkDoDesktop(codigo: string, estado: string) {
  return `forja://entrar?codigo=${encodeURIComponent(codigo)}&estado=${encodeURIComponent(estado)}`;
}

export const loginDoDesktop = () =>
  ({
    id: "forja-desktop",
    endpoints: {
      /** Só pelo servidor (auth.api): a página de autorização chama depois que a pessoa confirma. */
      gerarCodigoDoDesktop: createAuthEndpoint("/desktop/codigo", { method: "GET", use: [sessionMiddleware] }, async (c) => {
        if (c.request) throw new APIError("BAD_REQUEST", { message: "Só o servidor gera este código." });
        const codigo = generateRandomString(40);
        await c.context.internalAdapter.createVerificationValue({
          value: c.context.session.user.id,
          identifier: chave(codigo),
          expiresAt: new Date(Date.now() + VALIDADE_DO_CODIGO_MIN * 60_000),
        });
        return c.json({ codigo });
      }),
      trocarCodigoDoDesktop: createAuthEndpoint(
        "/desktop/sessao",
        { method: "POST", body: z.object({ codigo: z.string().min(20).max(200) }) },
        async (c) => {
          if (c.request?.headers.get(CABECALHO_DESKTOP) !== "1") throw new APIError("FORBIDDEN", { message: "Só o app desktop troca este código." });
          const guardado = await c.context.internalAdapter.consumeVerificationValue(chave(c.body.codigo));
          if (!guardado || guardado.expiresAt < new Date()) throw new APIError("BAD_REQUEST", { message: "Código inválido ou vencido." });
          const user = await c.context.internalAdapter.findUserById(guardado.value);
          if (!user) throw new APIError("BAD_REQUEST", { message: "Conta não encontrada." });
          const session = await c.context.internalAdapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Não consegui criar a sessão." });
          await setSessionCookie(c, { session, user });
          return c.json({ ok: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
