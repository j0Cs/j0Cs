/**
 * Forja no computador: uma janela com o app web e, por trás, o que só dá para fazer na máquina
 * (pastas locais, time nos arquivos, telemetria das ferramentas). A janela só navega na origem do
 * app; qualquer outro endereço abre no navegador do sistema.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray, type MenuItemConstructorOptions } from "electron";
import { aoMudarAtualizacao, instalarAtualizacao, ligarAtualizacao, situacaoDaAtualizacao, verificarAtualizacao } from "./atualizacao";
import { urlBase } from "./config";
import { Guardado } from "./guardado";
import { registrarIpc } from "./ipc";
import { destinoDe, lerLink, linkNosArgumentos } from "./navegacao";
import { paginaSemConexao } from "./sem-conexao";

const BASE = urlBase();
const ORIGEM = new URL(BASE).origin;
const NOME = "Forja";
const recurso = (...partes: string[]) => path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."), "recursos", ...partes);

let janela: BrowserWindow | null = null;
let bandeja: Tray | null = null;
let saindo = false;
/** Login pelo navegador em andamento: só o estado que este app sorteou é aceito na volta. */
let entrada: { estado: string; expira: number } | null = null;
let linkPendente: string | null = null;

if (process.env.FORJA_TESTE_DADOS && !app.isPackaged) app.setPath("userData", process.env.FORJA_TESTE_DADOS);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  iniciar();
}

function iniciar() {
  app.setName(NOME);
  if (process.platform === "win32") app.setAppUserModelId("dev.forja.desktop");
  // em desenvolvimento no Windows o protocolo precisa apontar para o script
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient("forja", process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient("forja");

  app.on("second-instance", (_e, argv) => {
    mostrar();
    const link = linkNosArgumentos(argv);
    if (link) void tratarLink(link);
  });
  app.on("open-url", (e, link) => {
    e.preventDefault();
    if (app.isReady()) void tratarLink(link);
    else linkPendente = link;
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    saindo = true;
  });
  app.on("activate", () => mostrar());

  // nenhuma janela nova e nenhum <webview>: tudo o que não é o app vai para o navegador
  app.on("web-contents-created", (_e, conteudo) => {
    conteudo.on("will-attach-webview", (e) => e.preventDefault());
    conteudo.setWindowOpenHandler(({ url }) => {
      abrirFora(url);
      return { action: "deny" };
    });
    const guardar = (e: Electron.Event, url: string) => {
      if (url.startsWith("data:text/html") && conteudo === janela?.webContents) return;
      const destino = destinoDe(url, BASE);
      if (destino === "app") return;
      e.preventDefault();
      if (url.startsWith("forja://")) void tratarLink(url);
      else if (destino === "navegador") abrirFora(url);
    };
    conteudo.on("will-navigate", guardar);
    conteudo.on("will-redirect", guardar);
  });

  void app.whenReady().then(() => {
    permissoes();
    registrarIpc({ base: BASE, janela: () => janela, entrarPeloNavegador, irPara });
    criarJanela();
    montarMenu();
    montarBandeja();
    ligarAtualizacao();
    aoMudarAtualizacao((s) => {
      montarMenu();
      if (s.estado === "pronta") void avisarAtualizacao();
    });
    const link = linkPendente ?? linkNosArgumentos(process.argv);
    linkPendente = null;
    if (link) void tratarLink(link);
  });
}

function abrirFora(url: string) {
  // "app" aqui é um link do próprio site pedindo janela nova (target=_blank): vai para o navegador também
  if (destinoDe(url, BASE) !== "barrar") void shell.openExternal(url);
}

/** Microfone (modo call), notificações e área de transferência só para a origem do app. */
function permissoes() {
  const liberadas = new Set(["media", "notifications", "clipboard-sanitized-write", "fullscreen"]);
  const daOrigem = (url: string) => {
    try {
      return new URL(url).origin === ORIGEM;
    } catch {
      return false;
    }
  };
  session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder, detalhes) => {
    const video = "mediaTypes" in detalhes && detalhes.mediaTypes?.includes("video");
    responder(daOrigem(detalhes.requestingUrl || conteudo.getURL()) && liberadas.has(permissao) && !video);
  });
  session.defaultSession.setPermissionCheckHandler((_c, permissao, origem) => daOrigem(origem) && liberadas.has(permissao));
}

function criarJanela() {
  const tamanho = new Guardado<{ largura: number; altura: number; cheia?: boolean }>(path.join(app.getPath("userData"), "janela.json"), {
    largura: 1320,
    altura: 860,
  });
  const t = tamanho.ler();
  janela = new BrowserWindow({
    width: Math.max(900, Math.min(Number(t.largura) || 1320, 4000)),
    height: Math.max(620, Math.min(Number(t.altura) || 860, 3000)),
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: NOME,
    backgroundColor: "#060a12",
    icon: process.platform === "linux" ? recurso("icone.png") : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
      additionalArguments: [`--forja-origem=${ORIGEM}`],
    },
  });
  if (t.cheia) janela.maximize();
  const j = janela;
  j.once("ready-to-show", () => {
    if (process.env.FORJA_TESTE_OCULTO !== "1") j.show();
  });
  j.on("close", (e) => {
    const [largura = 1320, altura = 860] = j.getNormalBounds ? [j.getNormalBounds().width, j.getNormalBounds().height] : j.getSize();
    tamanho.gravar({ largura, altura, cheia: j.isMaximized() });
    // no Mac, fechar a janela deixa o app no Dock, como os outros apps
    if (process.platform === "darwin" && !saindo) {
      e.preventDefault();
      j.hide();
    }
  });
  j.on("closed", () => {
    janela = null;
  });
  j.webContents.on("did-fail-load", (_e, codigo, descricao, url, principal) => {
    // -3 é navegação interrompida (outra começou), não é falha
    if (!principal || codigo === -3 || url.startsWith("data:")) return;
    void j.loadURL(paginaSemConexao(BASE, descricao));
  });
  j.webContents.session.setSpellCheckerLanguages?.(["pt-BR", "en-US"]);
  void j.loadURL(`${BASE}/central`);
}

function mostrar() {
  if (!janela) criarJanela();
  else {
    if (janela.isMinimized()) janela.restore();
    janela.show();
    janela.focus();
  }
}

function irPara(caminho: string) {
  mostrar();
  void janela?.loadURL(`${BASE}${caminho}`);
}

// ---------------------------------------------------------------------------
// Login pelo navegador e links forja://
// ---------------------------------------------------------------------------

function entrarPeloNavegador() {
  const estado = randomBytes(32).toString("base64url");
  entrada = { estado, expira: Date.now() + 10 * 60_000 };
  void shell.openExternal(`${BASE}/desktop/autorizar?estado=${estado}`);
}

async function tratarLink(link: string) {
  const l = lerLink(link);
  if (!l) return;
  mostrar();
  if (l.tipo === "abrir") return irPara(l.caminho);

  const esperada = entrada;
  entrada = null;
  if (!esperada || esperada.estado !== l.estado || esperada.expira < Date.now()) {
    return void avisar("Esse link de entrada não foi pedido por este app ou já venceu.", "Use Conta → Entrar pelo navegador e tente de novo.");
  }
  try {
    const r = await session.defaultSession.fetch(`${BASE}/api/desktop/sessao`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forja-desktop": "1" },
      body: JSON.stringify({ codigo: l.codigo }),
    });
    if (!r.ok) return void avisar("Não consegui entrar com esse código.", "Ele vale por 3 minutos e só uma vez. Tente de novo.");
    irPara("/central");
  } catch {
    void avisar("Sem conexão com a Forja.", "Confira a internet e tente entrar de novo.");
  }
}

function avisar(mensagem: string, detalhe: string) {
  if (process.env.FORJA_TESTE_OCULTO === "1") return console.error(`[aviso] ${mensagem}`);
  if (janela) return dialog.showMessageBox(janela, { type: "warning", message: mensagem, detail: detalhe, buttons: ["OK"] });
}

async function avisarAtualizacao() {
  if (!janela) return;
  const s = situacaoDaAtualizacao();
  const r = await dialog.showMessageBox(janela, {
    type: "info",
    message: `A versão ${s.novaVersao ?? "nova"} da Forja está pronta.`,
    detail: "Reinicie o app para atualizar. Se preferir, ela entra sozinha quando você fechar.",
    buttons: ["Reiniciar agora", "Depois"],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) instalarAtualizacao();
}

// ---------------------------------------------------------------------------
// Menu e bandeja
// ---------------------------------------------------------------------------

const TELAS: [string, string, string?][] = [
  ["Central", "/central", "CmdOrCtrl+1"],
  ["Projetos", "/projetos", "CmdOrCtrl+2"],
  ["Agente", "/agente", "CmdOrCtrl+3"],
  ["Assistentes de IA", "/assistentes", "CmdOrCtrl+4"],
  ["Este computador", "/computador", "CmdOrCtrl+5"],
];

function itemDeAtualizacao(): MenuItemConstructorOptions {
  const s = situacaoDaAtualizacao();
  if (s.estado === "pronta") return { label: `Reiniciar e instalar a versão ${s.novaVersao ?? "nova"}`, click: () => instalarAtualizacao() };
  if (s.estado === "baixando") return { label: `Baixando a versão ${s.novaVersao ?? "nova"}…`, enabled: false };
  if (s.estado === "verificando") return { label: "Procurando atualização…", enabled: false };
  return { label: "Procurar atualização", enabled: s.estado !== "desligada", click: () => void verificarAtualizacao() };
}

function montarMenu() {
  const mac = process.platform === "darwin";
  const sobre: MenuItemConstructorOptions = {
    label: `Sobre a ${NOME}`,
    click: () =>
      void dialog.showMessageBox({ type: "info", message: NOME, detail: `Versão ${app.getVersion()}\n${process.platform} ${process.arch}\n${ORIGEM}`, buttons: ["OK"] }),
  };
  const modelo: MenuItemConstructorOptions[] = [
    {
      label: mac ? NOME : "Arquivo",
      submenu: [
        sobre,
        itemDeAtualizacao(),
        { type: "separator" },
        ...(mac
          ? ([
              { role: "hide", label: `Ocultar a ${NOME}` },
              { role: "hideOthers", label: "Ocultar os outros" },
              { role: "unhide", label: "Mostrar todos" },
              { type: "separator" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        { role: "quit", label: `Sair da ${NOME}` },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { type: "separator" },
        { role: "resetZoom", label: "Tamanho normal" },
        { role: "zoomIn", label: "Aumentar" },
        { role: "zoomOut", label: "Diminuir" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
        ...(app.isPackaged ? [] : ([{ role: "toggleDevTools", label: "Ferramentas de desenvolvimento" }] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "Ir",
      submenu: [
        { label: "Voltar", accelerator: mac ? "Cmd+[" : "Alt+Left", click: () => janela?.webContents.navigationHistory.goBack() },
        { label: "Avançar", accelerator: mac ? "Cmd+]" : "Alt+Right", click: () => janela?.webContents.navigationHistory.goForward() },
        { type: "separator" },
        ...TELAS.map(([label, caminho, accelerator]): MenuItemConstructorOptions => ({ label, accelerator, click: () => irPara(caminho) })),
      ],
    },
    {
      label: "Conta",
      submenu: [
        { label: "Entrar pelo navegador", click: () => entrarPeloNavegador() },
        { label: "Plano e cobrança", click: () => irPara("/plano") },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        { label: "Suporte", click: () => void shell.openExternal(`${BASE}/suporte`) },
        { label: "Situação dos serviços", click: () => void shell.openExternal(`${BASE}/status`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

function montarBandeja() {
  if (bandeja || process.env.FORJA_TESTE_OCULTO === "1") return;
  try {
    const mac = process.platform === "darwin";
    const imagem = nativeImage.createFromPath(recurso(mac ? "bandejaTemplate.png" : "bandeja.png"));
    if (imagem.isEmpty()) return;
    bandeja = new Tray(imagem);
    bandeja.setToolTip(NOME);
    bandeja.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Abrir a ${NOME}`, click: () => mostrar() },
        { type: "separator" },
        ...TELAS.map(([label, caminho]): MenuItemConstructorOptions => ({ label, click: () => irPara(caminho) })),
        { type: "separator" },
        { label: "Sair", click: () => app.quit() },
      ]),
    );
    if (!mac) bandeja.on("click", () => mostrar());
  } catch {
    // sem área de notificação (alguns Linux): o app segue sem a bandeja
  }
}
