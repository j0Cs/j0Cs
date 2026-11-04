import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../client";

await migrate(getDb(), { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
console.log("✔ migrações aplicadas");
await closeDb();
