/**
 * Atualização automática pelos releases do GitHub (electron-updater). Só no app empacotado. No
 * macOS a atualização exige o app assinado; sem assinatura, o erro aparece na situação e a pessoa
 * baixa a versão nova pela página de download.
 */
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { SituacaoDaAtualizacao } from "../../../packages/agent/src/desktop";

let situacao: SituacaoDaAtualizacao = { versao: app.getVersion(), estado: "desligada" };
let ligada = false;
const mudou = new Set<(s: SituacaoDaAtualizacao) => void>();

function definir(parcial: Partial<SituacaoDaAtualizacao>) {
  situacao = { ...situacao, ...parcial };
  for (const f of mudou) f(situacao);
}

export const situacaoDaAtualizacao = () => situacao;
export const aoMudarAtualizacao = (f: (s: SituacaoDaAtualizacao) => void) => void mudou.add(f);

export function ligarAtualizacao() {
  if (!app.isPackaged || process.env.FORJA_SEM_ATUALIZACAO === "1") return;
  ligada = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => definir({ estado: "verificando", detalhe: undefined }));
  autoUpdater.on("update-not-available", () => definir({ estado: "em_dia" }));
  autoUpdater.on("update-available", (i) => definir({ estado: "baixando", novaVersao: i.version }));
  autoUpdater.on("update-downloaded", (i) => definir({ estado: "pronta", novaVersao: i.version }));
  autoUpdater.on("error", (e) => definir({ estado: "erro", detalhe: e.message.split("\n")[0]?.slice(0, 200) }));
  void verificarAtualizacao();
  setInterval(() => void verificarAtualizacao(), 6 * 60 * 60 * 1000).unref();
}

export async function verificarAtualizacao(): Promise<SituacaoDaAtualizacao> {
  if (!ligada) return situacao;
  if (situacao.estado === "baixando" || situacao.estado === "pronta") return situacao;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    definir({ estado: "erro", detalhe: e instanceof Error ? e.message.split("\n")[0]?.slice(0, 200) : "Falha ao verificar." });
  }
  return situacao;
}

export function instalarAtualizacao() {
  if (ligada && situacao.estado === "pronta") autoUpdater.quitAndInstall();
}
