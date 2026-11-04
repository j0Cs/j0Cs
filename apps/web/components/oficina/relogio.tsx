"use client";

import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function Relogio() {
  const [agora, setAgora] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setAgora(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{agora ?? "--:--"}</span>;
}
