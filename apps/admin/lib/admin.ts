import { getDb } from "@forja/db";
import { connection } from "next/server";

/** Acesso ao banco para páginas do painel (sempre dinâmicas). */
export async function adminDb() {
  await connection();
  return getDb();
}

export const num = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
