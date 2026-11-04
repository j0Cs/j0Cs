import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile("../../.env");
} catch {
  // sem .env na raiz: usa as variáveis do ambiente
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://forja:forja@localhost:5432/forja" },
});
