/**
 * O que o app web pode pedir ao computador. Cada chamada confere que veio da janela principal, do
 * quadro principal e da origem do app. Gravações passam antes por uma confirmação nativa, que a
 * página não consegue desenhar nem clicar.
 */
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, dialog, ipcMain, Notification, shell, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { AnaliseDaPasta, PastaLocal, PreviaDaTelemetria, ResultadoDeGravacao, SituacaoDaTelemetria } from "../../../packages/agent/src/desktop";
import { instalarAtualizacao, situacaoDaAtualizacao, verificarAtualizacao } from "./atualizacao";
import { analisarPasta } from "./pasta";
import { arquivoDe, ehFerramentaLocal, FERRAMENTAS_LOCAIS, gravarConfig, lerConfig, mesclar, situacaoDe, tokenValido, type FerramentaLocal } from "./telemetria";
import { ferramentasValidas, gravarTime, planejarTime } from "./time";
import { Guardado } from "./guardado";

export interface Contexto {
  base: string;
  janela: () => BrowserWindow | null;
  entrarPeloNavegador: () => void;
  irPara: (caminho: string) => void;
}

const idDaPasta = (caminho: string) => createHash("sha256").update(caminho).digest("hex").slice(0, 16);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function registrarIpc(ctx: Contexto) {
  const origem = new URL(ctx.base).origin;
  const recentes = new Guardado<{ caminho: string }[]>(path.join(app.getPath("userData"), "pastas.json"), []);
  /** Pastas que a pessoa escolheu pelo seletor do sistema (nesta sessão ou em anteriores). */
  const pastas = new Map<string, string>();
  for (const p of recentes.ler()) pastas.set(idDaPasta(p.caminho), p.caminho);

  const lembrar = (caminho: string) => {
    pastas.set(idDaPasta(caminho), caminho);
    recentes.gravar([{ caminho }, ...recentes.ler().filter((p) => p.caminho !== caminho)].slice(0, 12));
  };
  const local = (caminho: string): PastaLocal => ({ id: idDaPasta(caminho), nome: path.basename(caminho) || caminho, caminho });

  function permitido(e: IpcMainInvokeEvent) {
    const janela = ctx.janela();
    const quadro = e.senderFrame;
    if (!janela || !quadro || e.sender !== janela.webContents || quadro !== janela.webContents.mainFrame) return false;
    try {
      return new URL(quadro.url).origin === origem;
    } catch {
      return false;
    }
  }

  function canal<A extends unknown[], R>(nome: string, tratar: (...args: A) => R | Promise<R>) {
    ipcMain.handle(`forja:${nome}`, async (e, ...args) => {
      if (!permitido(e)) throw new Error("Chamada recusada.");
      return tratar(...(args as A));
    });
  }

  async function confirmar(mensagem: string, detalhe: string, botao: string) {
    const janela = ctx.janela();
    if (!janela) return false;
    // nos testes automatizados não há quem clique: FORJA_TESTE_CONFIRMA responde no lugar
    const teste = !app.isPackaged ? process.env.FORJA_TESTE_CONFIRMA : undefined;
    if (teste) return teste === "sim";
    const r = await dialog.showMessageBox(janela, {
      type: "question",
      buttons: [botao, "Cancelar"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: mensagem,
      detail: detalhe,
    });
    return r.response === 0;
  }

  async function analisar(caminho: string): Promise<AnaliseDaPasta> {
    return { ...local(caminho), ...(await analisarPasta(caminho)) };
  }

  canal("info", () => ({
    versao: app.getVersion(),
    sistema: process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux",
    processador: process.arch,
    computador: os.hostname().replace(/\.local$/, "").slice(0, 60),
  }));
  canal("entrar", () => ctx.entrarPeloNavegador());
  canal("notificar", (aviso: unknown) => {
    const a = (aviso ?? {}) as Record<string, unknown>;
    const titulo = texto(a.titulo, 80);
    if (!titulo || !Notification.isSupported()) return;
    const n = new Notification({ title: titulo, body: texto(a.corpo, 300) });
    const caminho = texto(a.caminho, 300);
    n.on("click", () => {
      const janela = ctx.janela();
      janela?.show();
      janela?.focus();
      if (/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(caminho) && !caminho.startsWith("//")) ctx.irPara(caminho);
    });
    n.show();
  });

  canal("pastas:escolher", async () => {
    const janela = ctx.janela();
    if (!janela) return null;
    const fixa = !app.isPackaged ? process.env.FORJA_TESTE_PASTA : undefined;
    const escolhidas = fixa
      ? [fixa]
      : (await dialog.showOpenDialog(janela, { title: "Abrir uma pasta de projeto", buttonLabel: "Abrir", properties: ["openDirectory"] })).filePaths;
    const caminho = escolhidas[0];
    if (!caminho) return null;
    lembrar(caminho);
    return analisar(caminho);
  });
  canal("pastas:recentes", async () => {
    const lista: PastaLocal[] = [];
    for (const p of recentes.ler()) {
      if ((await stat(p.caminho).catch(() => null))?.isDirectory()) lista.push(local(p.caminho));
    }
    return lista;
  });
  canal("pastas:analisar", async (id: unknown) => {
    const caminho = pastas.get(String(id));
    if (!caminho) return { erro: "Pasta não encontrada. Abra de novo pelo botão." };
    if (!(await stat(caminho).catch(() => null))?.isDirectory()) return { erro: "A pasta não existe mais neste computador." };
    return analisar(caminho);
  });
  canal("pastas:mostrar", async (id: unknown) => {
    const caminho = pastas.get(String(id));
    if (caminho) await shell.openPath(caminho);
  });

  canal("time:previa", async (id: unknown, ferramentas: unknown) => {
    const caminho = pastas.get(String(id));
    const lista = ferramentasValidas(ferramentas);
    if (!caminho) return { erro: "Pasta não encontrada. Abra de novo pelo botão." };
    if (!lista.length) return { erro: "Escolha pelo menos uma ferramenta." };
    return (await planejarTime(caminho, lista)).map(({ caminho: c, estado }) => ({ caminho: c, estado }));
  });
  canal("time:instalar", async (id: unknown, ferramentas: unknown): Promise<ResultadoDeGravacao> => {
    const caminho = pastas.get(String(id));
    const lista = ferramentasValidas(ferramentas);
    if (!caminho) return { ok: false, erro: "Pasta não encontrada. Abra de novo pelo botão." };
    if (!lista.length) return { ok: false, erro: "Escolha pelo menos uma ferramenta." };
    const plano = await planejarTime(caminho, lista);
    const mudam = plano.filter((p) => p.estado !== "igual");
    if (!mudam.length) return { ok: true, arquivos: [] };
    const linhas = mudam.slice(0, 25).map((p) => `${p.estado === "novo" ? "novo" : "altera"}  ${p.caminho}`);
    if (mudam.length > 25) linhas.push(`… e mais ${mudam.length - 25}`);
    const sim = await confirmar(
      `Instalar o time da Forja em "${path.basename(caminho)}"?`,
      `${caminho}\n\n${linhas.join("\n")}\n\nAGENTS.md e GEMINI.md existentes são preservados: só o bloco da Forja entra.`,
      `Gravar ${mudam.length} arquivo(s)`,
    );
    if (!sim) return { ok: false, cancelado: true };
    try {
      return { ok: true, arquivos: await gravarTime(caminho, plano) };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "Não consegui gravar." };
    }
  });

  const home = () => process.env.FORJA_TESTE_HOME && !app.isPackaged ? process.env.FORJA_TESTE_HOME : os.homedir();
  const exibir = (arquivo: string) => arquivo.replace(home(), "~");

  canal("telemetria:situacao", async (): Promise<SituacaoDaTelemetria[]> => {
    const lista: SituacaoDaTelemetria[] = [];
    for (const f of Object.keys(FERRAMENTAS_LOCAIS) as FerramentaLocal[]) {
      const arquivo = arquivoDe(f, home());
      const atual = await lerConfig(arquivo).catch(() => null);
      lista.push({ ferramenta: f, arquivo: exibir(arquivo), ...situacaoDe(f, atual, ctx.base) });
    }
    return lista;
  });
  canal("telemetria:previa", async (ferramenta: unknown, token: unknown): Promise<PreviaDaTelemetria> => {
    if (!ehFerramentaLocal(ferramenta) || !tokenValido(token)) return { arquivo: "", existe: false, mudancas: [], erro: "Pedido inválido." };
    const arquivo = arquivoDe(ferramenta, home());
    const atual = await lerConfig(arquivo);
    const m = mesclar(ferramenta, atual, ctx.base, token);
    return "erro" in m ? { arquivo: exibir(arquivo), existe: atual !== null, mudancas: [], erro: m.erro } : { arquivo: exibir(arquivo), existe: atual !== null, mudancas: m.mudancas };
  });
  canal("telemetria:aplicar", async (ferramenta: unknown, token: unknown): Promise<ResultadoDeGravacao> => {
    if (!ehFerramentaLocal(ferramenta) || !tokenValido(token)) return { ok: false, erro: "Pedido inválido." };
    const arquivo = arquivoDe(ferramenta, home());
    const atual = await lerConfig(arquivo);
    const m = mesclar(ferramenta, atual, ctx.base, token);
    if ("erro" in m) return { ok: false, erro: m.erro };
    if (!m.mudancas.length) return { ok: true, arquivos: [], copiaDeSeguranca: null };
    const nome = FERRAMENTAS_LOCAIS[ferramenta].nome;
    const sim = await confirmar(
      `Ligar o envio de uso do ${nome} para a Forja?`,
      `Arquivo: ${arquivo}\n\n${m.mudancas.join("\n")}\n\nSó os números de cada pedido são enviados (modelo, tokens, custo, duração). Prompts, respostas e código não saem do computador.${atual !== null ? `\n\nO arquivo atual fica guardado em ${path.basename(arquivo)}.forja-backup.` : ""}`,
      "Gravar a configuração",
    );
    if (!sim) return { ok: false, cancelado: true };
    try {
      const copia = await gravarConfig(arquivo, m.texto);
      return { ok: true, arquivos: [exibir(arquivo)], copiaDeSeguranca: copia ? exibir(copia) : null };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "Não consegui gravar." };
    }
  });

  canal("atualizacao:situacao", () => situacaoDaAtualizacao());
  canal("atualizacao:verificar", () => verificarAtualizacao());
  canal("atualizacao:instalar", () => instalarAtualizacao());
}
