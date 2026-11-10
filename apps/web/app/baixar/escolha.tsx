"use client";

import { buttonClass, cx } from "@forja/ui";
import { useEffect, useState } from "react";
import { BASE_DOS_INSTALADORES, INSTALADORES, type Instalador } from "@/lib/desktop";

type Deteccao = { instalador: Instalador | null; certeza: boolean; celular: boolean };

/** Sistema e processador pelo navegador. No Mac, o Safari não informa o processador: aí a pessoa escolhe. */
async function detectar(): Promise<Deteccao> {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return { instalador: null, certeza: false, celular: true };
  const dados = (navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } }).userAgentData;
  const plataforma = dados?.platform ?? (/(Mac|iMac)/i.test(ua) ? "macOS" : /Win/i.test(ua) ? "Windows" : "");
  if (plataforma === "Windows") return { instalador: "windows_x64", certeza: true, celular: false };
  if (plataforma === "macOS") {
    const arq = await dados?.getHighEntropyValues?.(["architecture"]).then((v) => v.architecture).catch(() => undefined);
    if (arq === "arm") return { instalador: "mac_arm64", certeza: true, celular: false };
    if (arq === "x86") return { instalador: "mac_x64", certeza: true, celular: false };
    return { instalador: "mac_arm64", certeza: false, celular: false };
  }
  return { instalador: null, certeza: false, celular: false };
}

const link = (i: Instalador) => `${BASE_DOS_INSTALADORES}/${INSTALADORES[i].arquivo}`;

export function EscolhaDoInstalador() {
  const [d, setD] = useState<Deteccao | null>(null);
  useEffect(() => void detectar().then(setD), []);
  const principal = d?.instalador ?? null;
  const outros = (Object.keys(INSTALADORES) as Instalador[]).filter((i) => i !== principal);

  return (
    <div className="mt-10">
      {principal ? (
        <div className="rounded-lg border border-aco-700 bg-aco-850/70 p-6" data-testid="principal">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">{d?.certeza ? "Para este computador" : "Provavelmente o seu"}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold uppercase text-aco-100">{INSTALADORES[principal].nome}</h2>
          <p className="mt-1 text-sm text-aco-300">{INSTALADORES[principal].detalhe}</p>
          <a href={link(principal)} className={cx(buttonClass("brasa"), "mt-5 px-5 py-3 text-[15px]")}>
            Baixar a Forja <span aria-hidden>↓</span>
          </a>
          {!d?.certeza ? (
            <p className="mt-4 text-sm text-palha">
              Não deu para ver o processador deste Mac. Confira no menu Apple → Sobre Este Mac: se aparecer "Chip Apple", é este; se aparecer "Processador Intel", use o de Intel abaixo.
            </p>
          ) : null}
        </div>
      ) : d ? (
        <p className="rounded-r-md border-l-2 border-palha bg-palha/10 px-4 py-3 text-sm text-palha" data-testid="sem-deteccao">
          {d.celular ? "O app é para computador (macOS e Windows). Abra esta página no computador para baixar." : "O app existe para macOS e Windows. Escolha o seu abaixo."}
        </p>
      ) : (
        <div className="h-44 rounded-lg border border-aco-800 bg-aco-850/40" aria-hidden />
      )}

      <h2 className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">{principal ? "Outras versões" : "Versões"}</h2>
      <ul className="mt-3 divide-y divide-aco-800 border-y border-aco-800">
        {outros.map((i) => (
          <li key={i} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium text-aco-100">{INSTALADORES[i].nome}</p>
              <p className="text-sm text-aco-300">{INSTALADORES[i].detalhe}</p>
            </div>
            <a href={link(i)} className={cx(buttonClass("aco", "sm"), "px-3.5 py-2 text-sm")}>
              Baixar
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
