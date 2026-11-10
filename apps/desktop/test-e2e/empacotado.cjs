/**
 * Fumaça do app já empacotado (roda no CI em cada sistema, depois do electron-builder):
 * o executável abre, carrega o código de dentro do pacote e acha os próprios recursos.
 *   node test-e2e/empacotado.cjs <caminho do executável>
 * Aponta para um endereço fechado de propósito: o esperado é a página local "Sem conexão".
 */
const { _electron } = require("playwright-core");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const executavel = process.argv[2];
if (!executavel || !fs.existsSync(executavel)) {
  console.error(`Executável não encontrado: ${executavel}`);
  process.exit(1);
}
let falhas = 0;
const confere = (nome, ok, detalhe = "") => {
  if (!ok) falhas++;
  console.log(`${ok ? "✔" : "✘"} ${nome}${ok || !detalhe ? "" : ` — ${detalhe}`}`);
};

(async () => {
  const app = await _electron.launch({
    executablePath: executavel,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env: { ...process.env, FORJA_URL: "http://127.0.0.1:9", FORJA_SEM_ATUALIZACAO: "1", HOME: process.env.HOME ?? os.homedir() },
    timeout: 60_000,
  });
  const dados = await app.evaluate(({ app: a }) => ({ empacotado: a.isPackaged, versao: a.getVersion(), nome: a.getName(), recursos: process.resourcesPath, protocolo: a.isDefaultProtocolClient("forja") }));
  const esperada = require("../package.json").version;
  confere("roda empacotado", dados.empacotado === true);
  confere(`versão ${esperada} e nome Forja`, dados.versao === esperada && dados.nome === "Forja", JSON.stringify(dados));
  confere("ícones da bandeja dentro do pacote", ["bandeja.png", "bandejaTemplate.png", "icone.png"].every((f) => fs.existsSync(path.join(dados.recursos, "recursos", f))));
  confere("configuração da atualização automática dentro do pacote", fs.existsSync(path.join(dados.recursos, "app-update.yml")));
  const janela = await app.firstWindow({ timeout: 60_000 });
  await janela.getByText("Sem conexão com a Forja").waitFor({ timeout: 30_000 });
  confere("abre a janela e mostra a página local quando o servidor não responde", true);
  confere("a ponte não aparece fora da origem do app", await janela.evaluate(() => typeof window.forjaDesktop === "undefined"));
  await app.close();
  console.log(falhas ? `\n✘ ${falhas} falharam` : "\n✔ app empacotado ok");
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
