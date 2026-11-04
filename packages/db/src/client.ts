import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __forjaDb?: Db; __forjaPool?: pg.Pool };

/** Conexão preguiçosa e única por processo (sobrevive ao hot reload do Next). */
export function getDb(): Db {
  if (!g.__forjaDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não definida (veja .env.example).");
    g.__forjaPool = new pg.Pool({ connectionString, max: 10 });
    g.__forjaDb = drizzle(g.__forjaPool, { schema });
  }
  return g.__forjaDb;
}

export async function closeDb() {
  await g.__forjaPool?.end();
  g.__forjaPool = undefined;
  g.__forjaDb = undefined;
}
