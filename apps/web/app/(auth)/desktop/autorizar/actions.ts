"use server";

import { estadoValido, getWebAuth, linkDoDesktop } from "@forja/auth";
import { consumeRateLimit, getDb } from "@forja/db";
import { headers } from "next/headers";
import { getAuthUser } from "@/lib/session";

/** Cria o código de uso único (3 minutos) e devolve o link forja:// que entrega o código ao app. */
export async function autorizarDesktopAction(estado: string): Promise<{ link?: string; erro?: string }> {
  const user = await getAuthUser();
  if (!user) return { erro: "Sua sessão acabou. Entre de novo e repita." };
  if (!estadoValido(estado)) return { erro: "Pedido inválido. Volte ao app e comece de novo." };
  if (!(await consumeRateLimit(getDb(), `desktop:codigo:${user.id}`, 10, 600))) return { erro: "Muitas tentativas. Espere alguns minutos." };
  try {
    const { codigo } = await getWebAuth().api.gerarCodigoDoDesktop({ headers: await headers() });
    return { link: linkDoDesktop(codigo, estado) };
  } catch {
    return { erro: "Não consegui gerar o código. Tente de novo." };
  }
}
