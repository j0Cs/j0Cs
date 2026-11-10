import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

/** Display industrial (letreiro de galpão), texto de engenharia e mono para leituras do painel. */
export const shoulders = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-shoulders", display: "swap" });
export const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
export const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
