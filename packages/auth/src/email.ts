/**
 * Envio de e-mail transacional pelo Microsoft 365 (Microsoft Graph, permissão de
 * aplicativo Mail.Send restrita a UMA caixa — ver docs/05-microsoft-365-email.md).
 *
 * Sem MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET:
 * - desenvolvimento: o e-mail é impresso no console do servidor (com o link);
 * - produção: falha visível no log, SEM expor o link (quem lê log entraria na conta).
 *   EMAIL_TO_CONSOLE=1 libera o console só para testes locais com `next start`.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Link principal do e-mail — impresso no console em desenvolvimento. */
  link?: string;
}

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  from: string;
}

function graphConfig(): GraphConfig | null {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, EMAIL_FROM } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) return null;
  if (!EMAIL_FROM) throw new Error("EMAIL_FROM (caixa remetente do Microsoft 365) não definido.");
  return { tenantId: MS_TENANT_ID, clientId: MS_CLIENT_ID, clientSecret: MS_CLIENT_SECRET, from: EMAIL_FROM };
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

/** Token de aplicativo (client credentials), reaproveitado até 1 min antes de expirar. */
async function graphToken(cfg: GraphConfig, fetchImpl: typeof fetch): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Microsoft 365 recusou a autenticação (${res.status}): ${body.error_description?.split("\n")[0] ?? "sem detalhes"}`);
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000, key };
  return body.access_token;
}

export async function sendEmail(msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
  const cfg = graphConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_TO_CONSOLE !== "1") {
      console.error(JSON.stringify({ level: "error", msg: "Microsoft 365 não configurado: e-mail não enviado", to: msg.to, subject: msg.subject }));
      return;
    }
    console.log(`\n✉️  [e-mail de desenvolvimento] para ${msg.to}: ${msg.subject}\n   ${msg.link ?? ""}\n`);
    return;
  }

  const token = await graphToken(cfg, fetchImpl);
  const enviar = () =>
    fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.from)}/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: { contentType: "HTML", content: msg.html },
          toRecipients: [{ emailAddress: { address: msg.to } }],
        },
        // boolean de verdade (links de acesso não devem ficar guardados em Itens Enviados)
        saveToSentItems: false,
      }),
    });
  let res = await enviar();
  // Limites do Exchange/Graph (30/min, 4 simultâneos por caixa): espera o Retry-After e tenta 1x
  if (res.status === 429 || res.status === 503) {
    const espera = Math.min(Number(res.headers.get("retry-after") ?? 2), 10) * 1000;
    await new Promise((r) => setTimeout(r, espera));
    res = await enviar();
  }
  // Sucesso = 202 Accepted (o Exchange entrega de forma assíncrona).
  if (res.status !== 202) {
    if (res.status === 401) cachedToken = null;
    throw new Error(`Falha ao enviar e-mail pelo Microsoft 365 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

/** Só para testes. */
export function resetEmailTokenCache() {
  cachedToken = null;
}

const APP = () => process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export function emailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#fafafa;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px">
<p style="font-weight:700;color:#ea580c;margin:0 0 16px">${APP()}</p>
<h1 style="font-size:18px;margin:0 0 12px;color:#18181b">${title}</h1>
<div style="font-size:14px;line-height:1.6;color:#3f3f46">${body}</div>
${cta ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">${cta.label}</a></p><p style="font-size:12px;color:#71717a">Ou copie o link: ${cta.url}</p>` : ""}
</div></body></html>`;
}
