import { emailLayout, escapeHtml, sendEmail, webUrl } from "@forja/auth";

/** Só servidor: NÃO exportar de arquivo "use server" (viraria endpoint público de envio de e-mail). */
export async function sendInviteEmail(input: { to: string; orgName: string; inviter: string; token: string }) {
  const url = `${webUrl()}/convite/${input.token}`;
  await sendEmail({
    to: input.to,
    subject: `${input.inviter} convidou você para ${input.orgName}`,
    link: url,
    html: emailLayout(
      `Convite para ${input.orgName}`,
      `${escapeHtml(input.inviter)} convidou você para a equipe <b>${escapeHtml(input.orgName)}</b>. O convite vale por 7 dias.`,
      { label: "Aceitar convite", url },
    ),
  });
}
