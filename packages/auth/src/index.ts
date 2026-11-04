import { getDb, schema } from "@forja/db";
import { waitUntil } from "@vercel/functions";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { emailLayout, sendEmail } from "./email";

/*
 * Autenticação compartilhada pelos dois apps. Mesmo banco e mesmos usuários, mas
 * cookies, URLs e regras diferentes:
 * - web:   cadastro aberto, e-mail e senha, link mágico, GitHub (se configurado)
 * - admin: sem cadastro (só contas "staff"), 2FA obrigatório
 */

const appName = () => process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/**
 * URL pública do app: variável explícita (WEB_URL/ADMIN_URL) > domínio de produção que a
 * Vercel injeta no projeto (o .vercel.app, ou o domínio próprio quando houver) > localhost.
 */
function publicUrl(explicit: string | undefined, devPort: number): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : `http://localhost:${devPort}`;
}
export const webUrl = () => publicUrl(process.env.WEB_URL, 3000);
export const adminUrl = () => publicUrl(process.env.ADMIN_URL, 3001);

function baseOptions(baseURL: string, cookiePrefix: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET não definida.");
  }
  return {
    appName: appName(),
    baseURL,
    secret: secret ?? "dev-secret-troque-em-producao-0000000000",
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        twoFactors: schema.twoFactors,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix,
      // E-mails saem em segundo plano: a resposta não espera o envio (evita ataque por tempo
      // de resposta) e, na Vercel, waitUntil garante que o envio termine.
      backgroundTasks: { handler: (p) => waitUntil(p) },
    },
    account: { encryptOAuthTokens: true },
    user: {
      additionalFields: {
        platformRole: { type: "string", required: false, defaultValue: "customer", input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 30 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      async sendResetPassword({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: `Redefinir sua senha · ${appName()}`,
          link: url,
          html: emailLayout("Redefinir senha", "Recebemos um pedido para trocar a sua senha. O link vale por 1 hora.", {
            label: "Criar nova senha",
            url,
          }),
        });
      },
    },
  } satisfies BetterAuthOptions;
}

function githubProvider() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { github: { clientId, clientSecret } } : {};
}

export const isGithubLoginEnabled = () => Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

function createWebAuth() {
  const base = baseOptions(webUrl(), "forja");
  return betterAuth({
    ...base,
    socialProviders: githubProvider(),
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: `Confirme seu e-mail · ${appName()}`,
          link: url,
          html: emailLayout(`Olá, ${user.name}!`, "Confirme seu e-mail para liberar sua conta.", { label: "Confirmar e-mail", url }),
        });
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        async sendMagicLink({ email, url }) {
          await sendEmail({
            to: email,
            subject: `Seu link de acesso · ${appName()}`,
            link: url,
            html: emailLayout("Entrar sem senha", "Clique no botão para entrar. O link vale por 5 minutos.", { label: "Entrar", url }),
          });
        },
      }),
      nextCookies(),
    ],
  });
}

function createAdminAuth() {
  const base = baseOptions(adminUrl(), "forja-admin");
  return betterAuth({
    ...base,
    emailAndPassword: { ...base.emailAndPassword, disableSignUp: true },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    plugins: [twoFactor({ issuer: `${appName()} Admin` }), nextCookies()],
  });
}

export type WebAuth = ReturnType<typeof createWebAuth>;
export type AdminAuth = ReturnType<typeof createAdminAuth>;

const g = globalThis as unknown as { __forjaWebAuth?: WebAuth; __forjaAdminAuth?: AdminAuth };

/** Instância preguiçosa (não toca no banco durante o build). */
export function getWebAuth(): WebAuth {
  return (g.__forjaWebAuth ??= createWebAuth());
}

export function getAdminAuth(): AdminAuth {
  return (g.__forjaAdminAuth ??= createAdminAuth());
}

export { hashPassword } from "better-auth/crypto";
export { sendEmail, emailLayout, escapeHtml } from "./email";
export { authErrorMessage } from "./errors";
export { caminhoInterno } from "./redirect";
