/**
 * Régua de têmpera: cada cor que o aço ganha no calor marca uma etapa do trabalho na Forja, do
 * pedido ao sistema no ar. As temperaturas são as reais de cada cor de revenimento (e a da forja).
 */
const ETAPAS = [
  { nome: "Ideia", grau: "220 °C" },
  { nome: "Plano", grau: "240 °C" },
  { nome: "Código", grau: "270 °C" },
  { nome: "Revisão", grau: "300 °C" },
  { nome: "No ar", grau: "1.100 °C" },
];

export function ReguaDeTempera({ className }: { className?: string }) {
  return (
    <figure className={className}>
      <figcaption className="mb-4 flex items-baseline justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">
        <span>Régua de têmpera</span>
        <span className="tracking-[0.14em]">do pedido ao ar</span>
      </figcaption>
      <div aria-hidden className="relative h-1.5 rounded-full bg-aco-800">
        <div className="regua-faixa absolute inset-0 rounded-full" />
        <span className="regua-brasa absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brasa-claro shadow-[0_0_0_3px_rgb(255_106_26/0.25),0_0_18px_4px_rgb(255_106_26/0.45)]" />
      </div>
      <ol className="mt-3 grid grid-cols-5 text-[11px] leading-tight">
        {ETAPAS.map((e, i) => (
          <li key={e.nome} className={i === 0 ? "text-left" : i === ETAPAS.length - 1 ? "text-right" : "text-center"}>
            <span className={`block font-mono uppercase tracking-[0.14em] ${i === ETAPAS.length - 1 ? "text-brasa-claro" : "text-aco-100"}`}>{e.nome}</span>
            <span className="mt-0.5 block font-mono text-aco-300">{e.grau}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
