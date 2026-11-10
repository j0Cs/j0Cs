/**
 * Roteiro do app desktop de verdade (Electron + app web local), com Playwright.
 * Pré-requisitos: Postgres local migrado e com a conta demo, e `next start` do app web na porta 3000.
 *   pnpm --filter @forja/desktop test:app
 * Sem tela (CI, servidor), rode dentro do xvfb-run, como o script já faz.
 */
const { _electron, chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = process.env.FORJA_URL ?? "http://localhost:3000";
const CONTA = { email: process.env.E2E_EMAIL ?? "demo@forja.dev", senha: process.env.E2E_SENHA ?? "demo12345" };
const FOTOS = process.env.E2E_FOTOS;
let falhas = 0;
let total = 0;
function confere(nome, ok, detalhe = "") {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "✔" : "✘"} ${nome}${ok || !detalhe ? "" : ` — ${detalhe}`}`);
}
const tmp = (nome) => fs.mkdtempSync(path.join(os.tmpdir(), `forja-e2e-${nome}-`));

function projetoDeTeste() {
  const raiz = tmp("projeto");
  fs.mkdirSync(path.join(raiz, "src"));
  fs.writeFileSync(path.join(raiz, "package.json"), JSON.stringify({ name: "loja", dependencies: { next: "16.0.0", react: "19.0.0" } }));
  fs.writeFileSync(path.join(raiz, "src", "pagar.ts"), `export const chave = "sk-ant-api03-${"k7".repeat(48)}";\n`);
  fs.writeFileSync(path.join(raiz, "AGENTS.md"), "# Regras da casa\n\nUse pnpm.\n");
  const g = (...a) => execFileSync("git", a, { cwd: raiz, stdio: "ignore" });
  g("init", "-q", "-b", "main");
  g("add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "inicial");
  return raiz;
}

(async () => {
  const home = tmp("home");
  const projeto = projetoDeTeste();
  fs.mkdirSync(path.join(home, ".claude"));
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ model: "opus", env: { MINHA: "1" } }, null, 2));

  const app = await _electron.launch({
    executablePath: require("electron"),
    args: ["--no-sandbox", "."],
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      FORJA_URL: BASE,
      FORJA_TESTE_DADOS: tmp("dados"),
      FORJA_TESTE_HOME: home,
      FORJA_TESTE_PASTA: projeto,
      FORJA_TESTE_CONFIRMA: "sim",
      FORJA_TESTE_OCULTO: "1",
    },
  });
  // o que o app mandaria abrir no navegador do sistema fica guardado para o teste
  await app.evaluate(({ shell }) => {
    globalThis.__abertos = [];
    shell.openExternal = async (u) => void globalThis.__abertos.push(u);
    shell.openPath = async (p) => (globalThis.__abertos.push(`pasta:${p}`), "");
  });
  const abertos = () => app.evaluate(() => globalThis.__abertos);
  const entregarLink = (link) => app.evaluate(({ app: a }, l) => void a.emit("second-instance", {}, ["forja", l]), link);
  const foto = async (nome) => FOTOS && (await janela.screenshot({ path: path.join(FOTOS, `${nome}.png`) }));

  const janela = await app.firstWindow();
  await janela.waitForURL(/\/entrar/);
  confere("abre e, sem sessão, cai na tela de entrada", true);
  confere("a página não tem Node (sandbox)", await janela.evaluate(() => typeof require === "undefined" && typeof process === "undefined"));
  confere("window.forjaDesktop existe na origem do app", await janela.evaluate(() => typeof window.forjaDesktop?.pastas?.escolher === "function"));
  const info = await janela.evaluate(() => window.forjaDesktop.info());
  confere("info do app", /^\d+\.\d+\.\d+/.test(info.versao) && info.sistema === "linux", JSON.stringify(info));

  // ---- login pelo navegador ----
  const botao = janela.getByRole("button", { name: "Entrar pelo navegador" });
  await botao.waitFor();
  await foto("d1-entrar");
  await botao.click();
  await janela.getByText("Abri o navegador").waitFor();
  const pedido = (await abertos()).at(-1) ?? "";
  const estado = new URL(pedido).searchParams.get("estado") ?? "";
  confere("abre o navegador na página de autorização, com estado sorteado", pedido.startsWith(`${BASE}/desktop/autorizar?estado=`) && estado.length >= 32, pedido);

  const navegador = await chromium.launch();
  const aba = await navegador.newPage();
  await aba.goto(pedido);
  await aba.waitForURL(/\/entrar\?next=/);
  confere("sem login no navegador, pede login e volta para a autorização", decodeURIComponent(aba.url()).includes("/desktop/autorizar?estado="));
  await aba.fill('input[name="email"]', CONTA.email);
  await aba.fill('input[name="password"]', CONTA.senha);
  await aba.getByRole("button", { name: "Entrar", exact: true }).click();
  await aba.waitForURL(/\/desktop\/autorizar/);
  await aba.getByText(`vai entrar como ${CONTA.email}`).waitFor();
  if (FOTOS) await aba.screenshot({ path: path.join(FOTOS, "d1-autorizar.png") });

  // o navegador "abre" forja://…: no teste o link é capturado pelo protocolo de depuração
  const cdp = await aba.context().newCDPSession(aba);
  await cdp.send("Page.enable");
  const pegarLink = () => new Promise((ok) => cdp.on("Page.frameRequestedNavigation", (e) => e.url.startsWith("forja://") && ok(e.url)));
  let espera = pegarLink();
  await aba.getByRole("button", { name: "Entrar no app com esta conta" }).click();
  const link = await espera;
  await aba.getByText("Volte para o app da Forja").waitFor();
  confere("a autorização devolve forja://entrar com código e o mesmo estado", /^forja:\/\/entrar\?codigo=[\w-]{20,}&estado=/.test(link) && link.includes(estado));

  const trocar = (codigo, cabecalho) =>
    fetch(`${BASE}/api/desktop/sessao`, { method: "POST", headers: { "content-type": "application/json", ...cabecalho }, body: JSON.stringify({ codigo }) });
  const codigo = new URL(link).searchParams.get("codigo");
  confere("troca sem o cabeçalho do app é recusada (403)", (await trocar(codigo, {})).status === 403);
  confere("código inventado é recusado (400)", (await trocar("x".repeat(40), { "x-forja-desktop": "1" })).status === 400);
  confere("gerar código direto pela API é recusado", (await aba.request.get(`${BASE}/api/auth/desktop/codigo`)).status() >= 400);

  // link com estado que o app não pediu: nada acontece (e o pedido em andamento é descartado)
  await entregarLink(link.replace(estado, "z".repeat(43)));
  await janela.waitForTimeout(1200);
  confere("link com estado desconhecido não entra", /\/entrar/.test(janela.url()));
  await entregarLink(link);
  await janela.waitForTimeout(1200);
  confere("depois de um link errado, o pedido antigo não vale mais", /\/entrar/.test(janela.url()));

  // de novo, do começo, agora certo
  await botao.click();
  await janela.waitForFunction((n) => true, null);
  let pedido2 = "";
  for (let i = 0; i < 20 && !(pedido2 = (await abertos()).at(-1) ?? "").includes("estado=") | (pedido2 === pedido); i++) await janela.waitForTimeout(100);
  await aba.goto(pedido2);
  espera = pegarLink();
  await aba.getByRole("button", { name: "Entrar no app com esta conta" }).click();
  const link2 = await espera;
  await entregarLink(link2);
  await janela.waitForURL(/\/central/, { timeout: 15000 });
  confere("o app entra com a conta do navegador", true);
  const codigo2 = new URL(link2).searchParams.get("codigo");
  confere("o código vale uma vez só", (await trocar(codigo2, { "x-forja-desktop": "1" })).status === 400);
  // sessões separadas: sair no navegador não derruba o app
  await aba.context().clearCookies();
  await janela.goto(`${BASE}/computador`);
  await janela.getByTestId("info-do-app").waitFor();
  confere("a sessão do app é independente da do navegador", /\/computador/.test(janela.url()));

  // ---- este computador: telemetria ----
  const linha = (nome) => janela.getByTestId("telemetria").locator("li", { hasText: nome });
  await linha("Claude Code").getByText("desligada").waitFor();
  confere("as três ferramentas aparecem desligadas", (await janela.getByTestId("telemetria").getByText("desligada").count()) === 3);
  await foto("d1-computador");
  await linha("Claude Code").getByRole("button", { name: "Ligar" }).click();
  await linha("Claude Code").getByText("enviando para a Forja").waitFor({ timeout: 15000 });
  const claude = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  confere(
    "settings.json do Claude Code: env juntado, resto preservado",
    claude.model === "opus" && claude.env.MINHA === "1" && claude.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT === `${BASE}/api/otlp/v1/logs` && /^Authorization=Bearer fj_otlp_/.test(claude.env.OTEL_EXPORTER_OTLP_HEADERS),
  );
  confere("o arquivo anterior ficou na cópia de segurança", JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json.forja-backup"), "utf8")).env.OTEL_LOGS_EXPORTER === undefined);
  const token = claude.env.OTEL_EXPORTER_OTLP_HEADERS.replace("Authorization=Bearer ", "");
  const envio = await fetch(`${BASE}/api/otlp/v1/logs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ resourceLogs: [] }),
  });
  confere("o token gravado é aceito pela rota de telemetria", envio.status === 200, String(envio.status));

  await app.evaluate(() => void (process.env.FORJA_TESTE_CONFIRMA = "nao"));
  await linha("Codex").getByRole("button", { name: "Ligar" }).click();
  await janela.waitForTimeout(1500);
  await linha("Codex").getByText("desligada").waitFor();
  confere("cancelar a confirmação não grava nada", !fs.existsSync(path.join(home, ".codex", "config.toml")));
  await app.evaluate(() => void (process.env.FORJA_TESTE_CONFIRMA = "sim"));
  await linha("Codex").getByRole("button", { name: "Ligar" }).click();
  await linha("Codex").getByText("enviando para a Forja").waitFor({ timeout: 15000 });
  confere("config.toml do Codex criado com [otel] e sem prompts", /\[otel\][\s\S]*log_user_prompt = false/.test(fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8")));

  await janela.goto(`${BASE}/assistentes`);
  const fontes = await janela.locator("body").innerText();
  confere("as fontes aparecem em Assistentes de IA (a cancelada foi revogada)", fontes.includes(`Claude Code · ${info.computador}`) && fontes.includes(`Codex · ${info.computador}`));

  // ---- este computador: pasta e time ----
  await janela.goto(`${BASE}/computador`);
  await janela.getByRole("button", { name: "Abrir pasta" }).click();
  const analise = janela.getByTestId("analise");
  await analise.waitFor({ timeout: 15000 });
  const texto = await analise.innerText();
  confere("lê a pasta: nome, branch e stack", texto.includes(path.basename(projeto)) && texto.includes("branch main") && texto.includes("Next.js"), texto.slice(0, 200));
  confere("a varredura acha a chave no código, com arquivo e linha", /src\/pagar\.ts:1/.test(await janela.getByTestId("achados").innerText()));
  confere("a chave não aparece inteira na tela", !texto.includes("k7".repeat(48)));
  await janela.getByTestId("plano").getByText(".claude/agents/forja-qa-pleno.md").waitFor();
  await janela.getByTestId("time").getByLabel("Codex").check();
  await janela.getByTestId("plano").locator("li", { hasText: "AGENTS.md" }).getByText("altera").waitFor();
  await foto("d1-pasta");
  await janela.getByTestId("time").getByRole("button", { name: /^Instalar \(\d+ arquivos\)$/ }).click();
  await janela.getByText(/arquivo\(s\) gravado\(s\)/).waitFor({ timeout: 15000 });
  const agents = fs.readFileSync(path.join(projeto, "AGENTS.md"), "utf8");
  confere(
    "time instalado nos arquivos, com o AGENTS.md preservado",
    fs.existsSync(path.join(projeto, ".claude", "agents", "forja-dev-senior.md")) && fs.existsSync(path.join(projeto, ".forja", "time", "qa-pleno.md")) && agents.startsWith("# Regras da casa") && agents.includes("forja:time:inicio"),
  );
  await janela.getByTestId("time").getByRole("button", { name: "Time em dia" }).waitFor();
  confere("depois de instalar, o time fica em dia", true);
  await janela.getByRole("button", { name: "Mostrar a pasta" }).click();
  await janela.waitForTimeout(300);
  confere("mostrar a pasta abre só a pasta escolhida", (await abertos()).at(-1) === `pasta:${projeto}`);
  const fora = await janela.evaluate(() => window.forjaDesktop.time.instalar("0000000000000000", ["claude_code"]));
  confere("pasta que não foi escolhida pelo seletor é recusada", fora.ok === false && /não encontrada/.test(fora.erro ?? ""));
  const ruim = await janela.evaluate(() => window.forjaDesktop.telemetria.aplicar("claude_code", 'fj_otlp_x"\n[injetado]'));
  confere("token fora do formato é recusado", ruim.ok === false);

  // ---- a janela não sai da origem do app ----
  await janela.evaluate(() => void (window.location.href = "https://example.com/fora"));
  await janela.waitForTimeout(800);
  confere("link para outro site abre no navegador, não na janela", new URL(janela.url()).origin === BASE && (await abertos()).at(-1) === "https://example.com/fora");
  await janela.evaluate(() => void window.open("https://example.org/nova"));
  await janela.waitForTimeout(500);
  confere("janela nova também vai para o navegador", app.windows().length === 1 && (await abertos()).at(-1) === "https://example.org/nova");
  await entregarLink("forja://abrir/projetos");
  await janela.waitForURL(/\/projetos/);
  confere("forja://abrir/projetos leva à tela", true);

  // ---- sem conexão ----
  await app.evaluate(({ BrowserWindow }) => void BrowserWindow.getAllWindows()[0].loadURL("http://localhost:9/central"));
  await janela.getByText("Sem conexão com a Forja").waitFor({ timeout: 10000 });
  confere("servidor fora do ar mostra a página local, sem a ponte", await janela.evaluate(() => typeof window.forjaDesktop === "undefined"));
  await foto("d1-sem-conexao");

  await navegador.close();
  await app.close();
  console.log(falhas ? `\n✘ ${falhas} de ${total} falharam` : `\n✔ tudo certo (${total} verificações)`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
