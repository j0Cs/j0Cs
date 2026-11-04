try {
  process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
} catch {
  // sem .env na raiz: usa as variáveis do ambiente
}
