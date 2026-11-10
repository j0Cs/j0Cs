"use server";

import { authErrorMessage, getAdminAuth } from "@forja/auth";
import { chaveAtiva } from "@forja/core/server";
import { consumeRateLimit } from "@forja/db";
import { gerarChavesAge, prepararAcessoDoBackup, recifrarSegredos } from "@forja/ops";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminDb, requireStaff } from "@/lib/admin";

/**
 * Troca a senha do painel (a inicial veio do ADMIN_PASSWORD). Encerra as outras sessões.
 */
export async function trocarSenhaAction(_: { erro?: string; ok?: string }, f: FormData): Promise<{ erro?: string; ok?: string }> {
  const user = await requireStaff();
  const db = await adminDb();
  if (!(await consumeRateLimit(db, `admin:senha:${user.id}`, 5, 900))) return { erro: "Muitas tentativas. Espere alguns minutos." };
  const atual = String(f.get("atual") ?? "");
  const nova = String(f.get("nova") ?? "");
  if (nova.length < 14) return { erro: "A senha nova precisa ter pelo menos 14 caracteres." };
  if (nova !== String(f.get("confirmacao") ?? "")) return { erro: "A confirmação não bate com a senha nova." };
  if (nova === atual) return { erro: "A senha nova precisa ser diferente da atual." };
  try {
    await getAdminAuth().api.changePassword({ body: { currentPassword: atual, newPassword: nova, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    return { erro: authErrorMessage(e) };
  }
  return { ok: "Senha trocada. As outras sessões do painel foram encerradas." };
}

/** Par de chaves do backup. Nada fica guardado: a privada aparece uma vez, no navegador do dono. */
export async function gerarChavesDoBackupAction() {
  await requireStaff();
  return gerarChavesAge();
}

/**
 * Acesso do backup ao banco: papel forja_backup (lê tudo, só escreve o registro do backup) com
 * senha nova. A URL aparece uma vez para o secret BACKUP_DATABASE_URL do GitHub.
 */
export async function gerarAcessoDoBackupAction(): Promise<{ url?: string; erro?: string }> {
  await requireStaff();
  const db = await adminDb();
  try {
    return { url: (await prepararAcessoDoBackup(db)).url };
  } catch (e) {
    return { erro: `Não consegui preparar o acesso no banco: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Valor para a próxima variável ENCRYPTION_KEY_<n>, mostrado uma vez (não fica guardado). */
export async function gerarChaveDeCriptografiaAction() {
  await requireStaff();
  return { nome: `ENCRYPTION_KEY_${chaveAtiva() + 1}`, valor: randomBytes(32).toString("base64") };
}

export async function recifrarAction() {
  await requireStaff();
  const db = await adminDb();
  try {
    const r = await recifrarSegredos(db);
    revalidatePath("/operacao");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, erro: e instanceof Error ? e.message : String(e) };
  }
}
