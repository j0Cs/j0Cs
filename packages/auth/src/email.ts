/**
 * Envio de e-mail transacional (Resend). Sem RESEND_API_KEY, em desenvolvimento,
 * o e-mail é impresso no console do servidor (com o link clicável).
 * Em produção sem chave, o envio falha de forma visível no log, sem expor o link.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Link principal do e-mail — impresso no console em desenvolvimento. */
  link?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Em produção NUNCA imprime o link (quem lê os logs entraria na conta).
    // EMAIL_TO_CONSOLE=1 libera o console só para testes locais com `next start`.
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_TO_CONSOLE !== "1") {
      console.error(JSON.stringify({ level: "error", msg: "RESEND_API_KEY ausente: e-mail não enviado", to: msg.to, subject: msg.subject }));
      return;
    }
    console.log(`\n✉️  [e-mail de desenvolvimento] para ${msg.to}: ${msg.subject}\n   ${msg.link ?? ""}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Forja <nao-responda@forja.dev>",
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
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
