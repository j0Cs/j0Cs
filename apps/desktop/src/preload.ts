/**
 * Ponte entre o app web e o computador. Roda isolada (contextIsolation + sandbox) e só expõe
 * window.forjaDesktop na origem do app; o processo principal confere a origem de novo em cada chamada.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { ForjaDesktop } from "../../../packages/agent/src/desktop";

const origem = process.argv.find((a) => a.startsWith("--forja-origem="))?.slice("--forja-origem=".length);
const chamar = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(`forja:${canal}`, ...args);

const api: ForjaDesktop = {
  info: () => chamar("info"),
  entrarPeloNavegador: () => chamar("entrar"),
  notificar: (aviso) => chamar("notificar", aviso),
  pastas: {
    escolher: () => chamar("pastas:escolher"),
    recentes: () => chamar("pastas:recentes"),
    analisar: (id) => chamar("pastas:analisar", id),
    mostrar: (id) => chamar("pastas:mostrar", id),
  },
  time: {
    previa: (id, ferramentas) => chamar("time:previa", id, ferramentas),
    instalar: (id, ferramentas) => chamar("time:instalar", id, ferramentas),
  },
  telemetria: {
    situacao: () => chamar("telemetria:situacao"),
    previa: (ferramenta, token) => chamar("telemetria:previa", ferramenta, token),
    aplicar: (ferramenta, token) => chamar("telemetria:aplicar", ferramenta, token),
  },
  atualizacao: {
    situacao: () => chamar("atualizacao:situacao"),
    verificar: () => chamar("atualizacao:verificar"),
    instalar: () => chamar("atualizacao:instalar"),
  },
};

if (origem && location.origin === origem) contextBridge.exposeInMainWorld("forjaDesktop", api);
