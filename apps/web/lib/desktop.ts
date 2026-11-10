import type { ForjaDesktop } from "@forja/agent";

declare global {
  interface Window {
    /** Só existe dentro do app desktop da Forja. */
    forjaDesktop?: ForjaDesktop;
  }
}

/** Endereço dos instaladores: os arquivos do release mais recente no GitHub. */
export const BASE_DOS_INSTALADORES = (process.env.NEXT_PUBLIC_DESKTOP_DOWNLOADS ?? "https://github.com/j0Cs/j0Cs/releases/latest/download").replace(/\/+$/, "");

export const INSTALADORES = {
  mac_arm64: { arquivo: "Forja-mac-arm64.dmg", nome: "macOS · Apple Silicon", detalhe: "M1, M2, M3, M4 ou mais novo" },
  mac_x64: { arquivo: "Forja-mac-x64.dmg", nome: "macOS · Intel", detalhe: "Macs com processador Intel" },
  windows_x64: { arquivo: "Forja-win-x64.exe", nome: "Windows", detalhe: "Windows 10 ou 11, 64 bits" },
} as const;
export type Instalador = keyof typeof INSTALADORES;
