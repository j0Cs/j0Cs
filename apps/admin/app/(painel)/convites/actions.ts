"use server";

import { CobrancaIndisponivel, criarCupomDeFundador, RegraDeCobranca, stripeConfigurado } from "@forja/billing";
import { eq, schema } from "@forja/db";
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { adminDb, num, requireStaff } from "@/lib/admin";

const voltar = (q: Record<string, string>): never => redirect(`/convites?${new URLSearchParams(q)}`);
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I/L, que confundem ao digitar
const novoCodigo = () => Array.from({ length: 10 }, () => LETRAS[randomInt(LETRAS.length)]).join("");

/** Cria um convite de fundador; com desconto e meses, cria também o cupom no Stripe. */
export async function criarConviteAction(f: FormData) {
  await requireStaff();
  const label = String(f.get("label") ?? "").trim().slice(0, 80);
  const dias = Math.round(num(f.get("dias")));
  const creditos = Math.round(num(f.get("creditos")) * 100);
  const usos = Math.round(num(f.get("usos"))) || 1;
  const validade = Math.round(num(f.get("validade")));
  const desconto = Math.round(num(f.get("desconto")) * 100);
  const meses = Math.round(num(f.get("meses")));
  let cupom = String(f.get("cupom") ?? "").trim().slice(0, 60) || null;
  const oferta = String(f.get("oferta") ?? "").trim().slice(0, 160) || null;

  if (!label) voltar({ erro: "Informe para quem é o convite." });
  if (dias < 1 || dias > 90) voltar({ erro: "Os dias de teste vão de 1 a 90." });
  if (creditos < 0 || creditos > 500_00) voltar({ erro: "Os créditos do teste vão de R$ 0 a R$ 500." });
  if (usos < 1 || usos > 500) voltar({ erro: "Os usos vão de 1 a 500." });

  if (desconto > 0 && !cupom) {
    if (!stripeConfigurado()) voltar({ erro: "O Stripe ainda não está configurado: crie o convite sem desconto ou cole o código de um cupom já criado." });
    try {
      cupom = await criarCupomDeFundador({ nome: `Fundador · ${label}`, descontoCentavos: desconto, meses });
    } catch (e) {
      if (e instanceof RegraDeCobranca || e instanceof CobrancaIndisponivel) voltar({ erro: e.message });
      console.error(JSON.stringify({ level: "error", msg: "criar cupom falhou", err: String(e) }));
      voltar({ erro: `O Stripe recusou o cupom: ${(e as Error).message}` });
    }
  }
  const db = await adminDb();
  const [c] = await db
    .insert(schema.betaInvites)
    .values({
      code: novoCodigo(),
      label,
      trialDays: dias,
      creditsBrlCents: creditos,
      stripeCouponId: cupom,
      offer: oferta,
      maxUses: usos,
      expiresAt: validade > 0 ? new Date(Date.now() + validade * 86_400_000) : null,
    })
    .returning();
  voltar({ ok: `Convite criado: ${c!.code}` });
}

export async function revogarConviteAction(f: FormData) {
  await requireStaff();
  const db = await adminDb();
  await db.update(schema.betaInvites).set({ revokedAt: new Date() }).where(eq(schema.betaInvites.id, String(f.get("id"))));
  voltar({ ok: "Convite revogado. Quem já entrou com ele continua com a conta." });
}
