import { TRIAL_PLAN_ID } from "./catalog";

/**
 * O que impede uma organização de usar os modelos e a voz (dados e projetos continuam lá).
 * Puro: o gateway, as rotas de voz e as telas usam a mesma regra.
 */
export type BloqueioCode = "org_inactive" | "payment_overdue" | "trial_ended" | "subscription_required";

export interface SituacaoDaOrg {
  status: "active" | "suspended";
  suspendedReason?: string | null;
  planId: string | null;
  trialEndsAt?: Date | null;
  pastDueSince?: Date | null;
}

/** Dias entre a primeira cobrança recusada e a suspensão automática. */
export const CARENCIA_INADIMPLENCIA_DIAS = 3;

export const MENSAGENS_DE_BLOQUEIO: Record<BloqueioCode, string> = {
  org_inactive: "Sua conta está suspensa. Fale com o suporte.",
  payment_overdue:
    "Há um pagamento pendente e o uso foi pausado. Atualize o pagamento em Plano e cobrança para continuar.",
  trial_ended: "Seu teste grátis acabou. Assine um plano em Plano e cobrança para continuar; seus projetos continuam salvos.",
  subscription_required: "Sua organização está sem plano ativo. Assine um plano em Plano e cobrança para continuar.",
};

const DIA_MS = 24 * 60 * 60 * 1000;

export function bloqueioDaOrg(o: SituacaoDaOrg, agora: Date = new Date()): { code: BloqueioCode; message: string } | null {
  const bloqueio = (code: BloqueioCode) => ({ code, message: MENSAGENS_DE_BLOQUEIO[code] });
  if (o.status === "suspended") return bloqueio(o.suspendedReason === "inadimplencia" ? "payment_overdue" : "org_inactive");
  // a varredura diária suspende; até lá, a carência já vale aqui
  if (o.pastDueSince && agora.getTime() - o.pastDueSince.getTime() >= CARENCIA_INADIMPLENCIA_DIAS * DIA_MS) {
    return bloqueio("payment_overdue");
  }
  if (!o.planId) return bloqueio("subscription_required");
  if (o.planId === TRIAL_PLAN_ID && o.trialEndsAt && o.trialEndsAt.getTime() <= agora.getTime()) return bloqueio("trial_ended");
  return null;
}

/** Dias que faltam no teste grátis (0 = acaba hoje ou já acabou). */
export function diasRestantesDoTeste(trialEndsAt: Date | null | undefined, agora: Date = new Date()) {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - agora.getTime()) / DIA_MS));
}
