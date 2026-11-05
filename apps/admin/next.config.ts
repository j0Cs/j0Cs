import path from "node:path";
import type { NextConfig } from "next";

// Lê o .env da raiz do monorepo (um arquivo só para apps e scripts).
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // em produção as variáveis vêm do provedor de hospedagem
}

const config: NextConfig = {
  transpilePackages: ["@forja/auth", "@forja/billing", "@forja/core", "@forja/db", "@forja/ui"],
  serverExternalPackages: ["pg"],
};

export default config;
