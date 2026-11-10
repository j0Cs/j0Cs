"use server";

import { webUrl } from "@forja/auth";
import {
  CobrancaIndisponivel,
  criarCheckoutAssinatura,
  criarCheckoutRecarga,
  criarSessaoDoPortal,
  RegraDeCobranca,
  trocarPlano,
} from "@forja/billing";
import { consumeRateLimit } from "@forja/db";
import { revalidatePath } from "next/cache";
import type { EstadoCobranca } from "@/components/form-cobranca";
import { canManage, getSession } from "@/lib/session";

const FALHA = "Não conseguimos falar com o sistema de pagamentos agora. Tente de novo em instantes.";

/** Erros de regra e de configuração vão para a tela; o resto vai para o log (texto do Stripe em inglês). */
function erro(e: unknown, acao: string): EstadoCobranca {
  if (e instanceof RegraDeCobranca || e instanceof CobrancaIndisponivel) return { error: e.message };
  console.error(JSON.stringify({ level: "error", msg: `cobrança: ${acao} falhou`, err: String(e) }));
  return { error: FALHA };
}

async function sessaoDeCobranca(acao: string) {
  const s = await getSession();
  if (!canManage(s.role)) return { erro: { error: "Só donos e administradores podem mexer no plano e nos pagamentos." } };
  if (!s.user.emailVerified) return { erro: { error: "Confirme seu e-mail antes de assinar ou pagar." } };
  if (!(await consumeRateLimit(s.db, `cobranca:${acao}:org:${s.org.id}`, 20, 3600))) {
    return { erro: { error: "Muitas tentativas na última hora. Tente de novo mais tarde." } };
  }
  return { s };
}

const inteiro = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

export async function assinarAction(_: EstadoCobranca, f: FormData): Promise<EstadoCobranca> {
  const { s, erro: negado } = await sessaoDeCobranca("checkout");
  if (!s) return negado!;
  try {
    const url = await criarCheckoutAssinatura(s.db, {
      org: s.org,
      email: s.user.email,
      planId: String(f.get("planId") ?? ""),
      assentos: inteiro(f.get("assentos")),
      baseUrl: webUrl(),
    });
    return { url };
  } catch (e) {
    return erro(e, "checkout da assinatura");
  }
}

export async function trocarPlanoAction(_: EstadoCobranca, f: FormData): Promise<EstadoCobranca> {
  const { s, erro: negado } = await sessaoDeCobranca("troca");
  if (!s) return negado!;
  try {
    const r = await trocarPlano(s.db, { org: s.org, planId: String(f.get("planId") ?? ""), assentos: inteiro(f.get("assentos")) });
    revalidatePath("/plano");
    if (r.tipo === "pendente" && r.url) return { url: r.url };
    return { ok: r.mensagem };
  } catch (e) {
    return erro(e, "troca de plano");
  }
}

export async function recarregarAction(_: EstadoCobranca, f: FormData): Promise<EstadoCobranca> {
  const { s, erro: negado } = await sessaoDeCobranca("recarga");
  if (!s) return negado!;
  try {
    const url = await criarCheckoutRecarga(s.db, {
      org: s.org,
      email: s.user.email,
      valorCentavos: inteiro(f.get("valor")) ?? 0,
      baseUrl: webUrl(),
    });
    return { url };
  } catch (e) {
    return erro(e, "checkout da recarga");
  }
}

export async function portalAction(_: EstadoCobranca): Promise<EstadoCobranca> {
  const { s, erro: negado } = await sessaoDeCobranca("portal");
  if (!s) return negado!;
  try {
    return { url: await criarSessaoDoPortal({ org: s.org, baseUrl: webUrl() }) };
  } catch (e) {
    return erro(e, "portal");
  }
}
