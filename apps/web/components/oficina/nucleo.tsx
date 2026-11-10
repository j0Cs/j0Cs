"use client";

import { useEffect, useId, useRef } from "react";

export type NucleoModo = "repouso" | "ouvindo" | "pensando" | "falando";

const BASE: Record<NucleoModo, number> = { repouso: 0.16, ouvindo: 0.32, pensando: 0.42, falando: 0.58 };

/** Arcos com as cores de revenimento do aço (palha → bronze → pavão → azul). */
const REVENIMENTO = ["var(--color-palha)", "var(--color-bronze)", "var(--color-pavao)", "var(--color-revenido)"];

function arco(r: number, inicio: number, fim: number) {
  const p = (a: number) => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)];
  const [x1, y1] = p(inicio);
  const [x2, y2] = p(fim);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${fim - inicio > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * O Núcleo: o coração da forja. A cor do centro segue a radiação de um metal
 * aquecido (vermelho fosco → laranja → branco-amarelado) conforme o "calor",
 * que sobe com o modo do agente e com o volume da voz.
 */
export function Nucleo({
  modo = "repouso",
  nivel,
  tamanho = 360,
  rotulo,
  className,
}: {
  modo?: NucleoModo;
  /** Volume atual 0..1 (lido a cada quadro, sem re-render). */
  nivel?: () => number;
  tamanho?: number;
  rotulo?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;

  useEffect(() => {
    let raf = 0;
    let calor = 0;
    let t = 0;
    const tick = () => {
      t += 1;
      const m = modoRef.current;
      const voz = Math.min(1, Math.max(0, nivelRef.current?.() ?? 0));
      // respiração lenta em repouso; voz empurra o calor para cima
      const respiro = m === "repouso" ? Math.sin(t / 90) * 0.04 : 0;
      const alvo = Math.min(1, BASE[m] + voz * 0.55 + respiro);
      calor += (alvo - calor) * 0.1;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--calor", calor.toFixed(3));
        el.style.setProperty("--voz", voz.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const marcas = Array.from({ length: 90 }, (_, i) => i * 4);
  // id único por instância: com duas instâncias na página (celular/desktop), um id
  // repetido faria o navegador usar o gradiente da instância escondida
  const gradId = `nucleo-metal-${useId().replace(/:/g, "")}`;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={rotulo ?? "Núcleo da forja"}
      className={`nucleo relative grid place-items-center ${className ?? ""}`}
      style={{ width: tamanho, height: tamanho, ["--calor" as string]: "0.16", ["--voz" as string]: "0" }}
    >
      {/* brilho difuso atrás do núcleo */}
      <div
        aria-hidden
        className="absolute inset-[14%] rounded-full blur-3xl transition-opacity"
        style={{
          background: "radial-gradient(circle, color-mix(in oklch, #ffd59a calc(var(--calor) * 100%), #ff5a14) 0%, transparent 68%)",
          opacity: "calc(0.25 + var(--calor) * 0.75)",
        }}
      />
      <svg viewBox="-200 -200 400 400" className="relative h-full w-full overflow-visible">
        <defs>
          <radialGradient id={gradId} cx="0" cy="0" r="1" gradientUnits="objectBoundingBox" fx="0.42" fy="0.38">
            <stop offset="0%" style={{ stopColor: "color-mix(in oklch, #fff4dc calc(var(--calor) * 100%), #ff8a3d)" }} />
            <stop offset="45%" style={{ stopColor: "color-mix(in oklch, #ff9a45 calc(var(--calor) * 100%), #9c2f10)" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in oklch, #b8380e calc(var(--calor) * 100%), #2a0d08)" }} />
          </radialGradient>
        </defs>

        {/* régua externa, como a borda graduada de um instrumento de bancada */}
        <g style={{ animation: "girar 140s linear infinite", transformOrigin: "0 0" }}>
          {marcas.map((a) => {
            const longa = a % 30 === 0;
            const r1 = longa ? 176 : 182;
            const rad = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={r1 * Math.cos(rad)}
                y1={r1 * Math.sin(rad)}
                x2={190 * Math.cos(rad)}
                y2={190 * Math.sin(rad)}
                stroke={longa ? "var(--color-aco-300)" : "var(--color-aco-500)"}
                strokeWidth={longa ? 1.4 : 0.8}
              />
            );
          })}
        </g>

        {/* anel de revenimento */}
        <g style={{ animation: "girar-reverso 90s linear infinite", transformOrigin: "0 0", opacity: "calc(0.35 + var(--calor) * 0.65)" }}>
          {REVENIMENTO.map((cor, i) => (
            <path key={cor} d={arco(158, i * 90 + 6, i * 90 + 84)} fill="none" stroke={cor} strokeWidth={3} strokeLinecap="round" />
          ))}
        </g>

        {/* anel de raciocínio (gira rápido enquanto o agente pensa) */}
        <circle
          r={136}
          fill="none"
          stroke="var(--color-aco-300)"
          strokeWidth={1}
          strokeDasharray="2 10"
          style={{
            opacity: modo === "pensando" ? 0.9 : 0.18,
            animation: modo === "pensando" ? "girar 2.6s linear infinite" : "girar 60s linear infinite",
            transformOrigin: "0 0",
            transition: "opacity .4s",
          }}
        />

        {/* anel de escuta (azul, pulsa com a voz do usuário) */}
        <circle
          r={118}
          fill="none"
          stroke="var(--color-revenido)"
          strokeWidth={2}
          style={{
            opacity: modo === "ouvindo" ? "calc(0.35 + var(--voz) * 0.65)" : 0,
            transform: "scale(calc(1 + var(--voz) * 0.06))",
            transformOrigin: "0 0",
            transition: "opacity .3s",
          }}
        />

        {/* metal incandescente */}
        <g style={{ transform: "scale(calc(0.94 + var(--calor) * 0.1))", transformOrigin: "0 0" }}>
          <circle r={96} fill={`url(#${gradId})`} />
          <circle r={96} fill="none" stroke="rgb(255 220 170 / 0.25)" strokeWidth={1} />
          <circle r={44} fill="none" stroke="rgb(255 240 210 / 0.35)" strokeWidth={0.8} />
        </g>
      </svg>
    </div>
  );
}
