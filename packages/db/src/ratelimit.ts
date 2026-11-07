import { sql } from "drizzle-orm";
import type { Db } from "./client";

/**
 * Janela fixa atômica (um UPSERT): devolve true se ainda está dentro do limite.
 * Ex.: consumir(db, `login:ip:${ip}`, 30, 900) → até 30 tentativas a cada 15 min.
 */
export async function consumeRateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { rows } = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  return Number(rows[0]?.count ?? 0) <= limit;
}

/** Contagem atual da janela (sem consumir). 0 se a chave não existe ou a janela venceu. */
export async function rateLimitCount(db: Db, key: string, windowSeconds: number): Promise<number> {
  const { rows } = await db.execute<{ count: number }>(sql`
    select count from rate_limits
    where key = ${key} and window_start >= now() - make_interval(secs => ${windowSeconds})`);
  return Number(rows[0]?.count ?? 0);
}

/** Devolve uma unidade consumida (ex.: login que deu certo depois de reservar a tentativa). */
export async function refundRateLimit(db: Db, key: string): Promise<void> {
  await db.execute(sql`update rate_limits set count = greatest(count - 1, 0) where key = ${key}`);
}
