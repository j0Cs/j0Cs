import { emailLayout, escapeHtml, sendEmail, webUrl } from "@forja/auth";
import { formatBrlCents, formatBrlMicros } from "@forja/core";
import { and, desc, eq, inArray, or, schema, sql, type Db } from "@forja/db";
import type { Aviso } from "./eventos";
import { deveAvisarSaldo, nivelDeSaldoBaixo } from "./regras";

/** Quem recebe os avisos de cobrança: donos e administradores da organização. */
async function destinatarios(db: Db, orgId: string) {
  const linhas = await db
    .select({ email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, orgId), inArray(schema.memberships.role, ["owner", "admin"])));
  return [...new Set(linhas.map((l) => l.email))];
}

async function enviarParaOrg(db: Db, orgId: string, assunto: string, corpo: string, cta?: { label: string; url: string }) {
  const html = emailLayout(assunto, corpo, cta);
  for (const to of await destinatarios(db, orgId)) {
    try {
      await sendEmail({ to, subject: assunto, html, link: cta?.url });
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "aviso de cobrança não enviado", assunto, erro: String(err) }));
    }
  }
}

const linkDoPlano = () => `${webUrl()}/plano`;

/** Envia os avisos de um evento já gravado. Falha de e-mail nunca desfaz o pagamento. */
export async function enviarAvisos(db: Db, avisos: Aviso[]) {
  for (const a of avisos) {
    const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, a.orgId) });
    if (!org) continue;
    const nome = escapeHtml(org.name);
    if (a.tipo === "recarga_confirmada") {
      await enviarParaOrg(
        db,
        a.orgId,
        "Recarga confirmada",
        `<p>Entraram <b>${formatBrlCents(a.valorCentavos)}</b> em créditos na conta <b>${nome}</b>.</p>
<p>Saldo atual: <b>${formatBrlMicros(org.creditBalanceBrlMicros)}</b>.</p>`,
        { label: "Ver saldo e extrato", url: `${webUrl()}/custos` },
      );
    } else if (a.tipo === "pagamento_recusado") {
      await enviarParaOrg(
        db,
        a.orgId,
        "Não conseguimos cobrar sua assinatura",
        `<p>A cobrança de <b>${formatBrlCents(a.valorCentavos)}</b> da conta <b>${nome}</b> não passou${a.motivo ? `: ${escapeHtml(a.motivo)}` : ""}.</p>
<p>Atualize o cartão ou pague a fatura em até <b>3 dias</b> para o uso não ser pausado. Seus projetos continuam salvos.</p>`,
        { label: "Pagar a fatura", url: a.url ?? linkDoPlano() },
      );
    } else if (a.tipo === "conta_reativada") {
      await enviarParaOrg(
        db,
        a.orgId,
        "Pagamento confirmado: tudo liberado",
        `<p>Recebemos o pagamento da conta <b>${nome}</b> e o uso voltou ao normal. Obrigado!</p>`,
        { label: "Abrir a Forja", url: `${webUrl()}/central` },
      );
    }
  }
}

/**
 * Aviso de saldo baixo (20% e 5% dos créditos do plano no ciclo), um por nível. Chamado depois de
 * cada cobrança de uso; a atualização condicional garante um único e-mail mesmo com chamadas juntas.
 */
export async function verificarSaldoBaixo(db: Db, orgId: string) {
  const [linha] = await db
    .select({
      saldo: schema.organizations.creditBalanceBrlMicros,
      avisado: schema.organizations.lowBalanceNotified,
      inclusos: schema.plans.includedCreditsBrlCents,
      nome: schema.organizations.name,
    })
    .from(schema.organizations)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .where(eq(schema.organizations.id, orgId));
  if (!linha?.inclusos) return;
  const [sub] = await db
    .select({ seats: schema.subscriptions.seats })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.orgId, orgId), inArray(schema.subscriptions.status, ["active", "past_due"])))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);
  const referencia = linha.inclusos * 10_000 * Math.max(1, sub?.seats ?? 1);
  const nivel = nivelDeSaldoBaixo(linha.saldo, referencia);
  if (!deveAvisarSaldo(nivel, linha.avisado)) return;

  const [marcado] = await db
    .update(schema.organizations)
    .set({ lowBalanceNotified: nivel })
    .where(
      and(
        eq(schema.organizations.id, orgId),
        or(sql`${schema.organizations.lowBalanceNotified} is null`, sql`${schema.organizations.lowBalanceNotified} > ${nivel}`),
      ),
    )
    .returning({ id: schema.organizations.id });
  if (!marcado) return;

  await enviarParaOrg(
    db,
    orgId,
    nivel === 5 ? "Seus créditos estão quase no fim" : "Seus créditos estão acabando",
    `<p>A conta <b>${escapeHtml(linha.nome)}</b> tem <b>${formatBrlMicros(Math.max(0, linha.saldo))}</b> em créditos, menos de ${nivel}% dos créditos do plano.</p>
<p>Recarregue por Pix ou cartão para não parar no meio de um projeto: o crédito entra na hora.</p>`,
    { label: "Recarregar", url: `${linkDoPlano()}#recarga` },
  );
}

/** Avisos da rotina diária (suspensão por falta de pagamento e fim do teste grátis). */
export async function avisarSuspensao(db: Db, orgId: string) {
  await enviarParaOrg(
    db,
    orgId,
    "Uso pausado por falta de pagamento",
    `<p>A cobrança da assinatura continua em aberto há mais de 3 dias, então o uso dos modelos e da voz foi pausado.</p>
<p>Seus projetos e conversas continuam salvos. Assim que o pagamento entrar, tudo volta na hora.</p>`,
    { label: "Regularizar o pagamento", url: linkDoPlano() },
  );
}

export async function avisarFimDoTeste(db: Db, orgId: string) {
  await enviarParaOrg(
    db,
    orgId,
    "Seu teste grátis acabou",
    `<p>Os 7 dias de teste terminaram. Seus projetos e conversas continuam salvos.</p>
<p>Assine um plano para continuar de onde parou, com todos os modelos liberados a partir do Pro.</p>`,
    { label: "Ver os planos", url: linkDoPlano() },
  );
}
