try {
  process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
} catch {
  // sem .env na raiz: usa as variáveis do ambiente
}

/**
 * Na Vercel, migração e seed só rodam no build de produção. Builds de preview (cada push
 * em branch) não podem alterar o banco de produção, nem falhar por não ter acesso a ele.
 */
export function somenteEmProducao(acao: string) {
  const ambiente = process.env.VERCEL_ENV;
  if (ambiente && ambiente !== "production") {
    console.log(`↷ etapa "${acao}" pulada no ambiente "${ambiente}" da Vercel (só roda em produção)`);
    process.exit(0);
  }
}
