import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("min-w-0 rounded-xl border border-zinc-200 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cx(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600",
          tone === "default" && "text-zinc-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </Card>
  );
}

const badgeTones = {
  gray: "bg-zinc-100 text-zinc-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-zinc-500/10", badgeTones[tone])}>
      {children}
    </span>
  );
}

const buttonVariants = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  brand: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-zinc-600 hover:bg-zinc-100",
  /** Telas de acesso (tema da oficina): ação principal em brasa e secundária em aço. */
  brasa:
    "bg-brasa font-semibold text-aco-950 shadow-[0_10px_30px_-12px_rgb(255_106_26/0.7)] hover:bg-brasa-claro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-revenido",
  aco: "border border-aco-700 bg-aco-850 text-aco-100 hover:border-aco-500 hover:bg-aco-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-revenido",
} as const;

export const buttonClass = (variant: keyof typeof buttonVariants = "primary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1 text-xs",
    buttonVariants[variant],
  );

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

/** Campo sem largura definida (use com w-20, w-auto… dentro de tabelas). */
export const inputBaseClass =
  "block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
export const inputClass = `${inputBaseClass} w-full`;

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Telas de acesso (login, cadastro, 2FA): tema escuro da oficina
// ---------------------------------------------------------------------------

export const inputAcessoClass =
  "block w-full rounded-md border border-aco-700 bg-aco-950/70 px-3.5 py-2.5 text-[15px] text-aco-100 placeholder:text-aco-500 transition-colors hover:border-aco-500 focus:border-revenido focus:outline-none focus:ring-2 focus:ring-revenido/30 read-only:text-aco-300";

export function CampoAcesso({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-aco-300">{hint}</span> : null}
    </label>
  );
}

export function AvisoAcesso({ tom = "erro", children }: { tom?: "erro" | "info" | "atencao"; children: ReactNode }) {
  const tons = {
    erro: "border-brasa bg-brasa/10 text-brasa-claro",
    info: "border-revenido bg-revenido/10 text-aco-100",
    atencao: "border-palha bg-palha/10 text-palha",
  };
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cx("rounded-r-md border-l-2 px-3.5 py-2.5 text-sm leading-relaxed", tons[tom])}>
      {children}
    </div>
  );
}

/** Link discreto das telas de acesso; `destaque` para a ação alternativa principal (ex.: criar conta). */
export const linkAcessoClass = (destaque = false) =>
  cx(
    "rounded-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-revenido",
    destaque ? "font-medium text-brasa-claro hover:text-brasa" : "text-aco-300 hover:text-aco-100",
  );

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("whitespace-nowrap border-b border-zinc-100 px-5 py-2.5 text-xs font-medium text-zinc-500", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("whitespace-nowrap border-b border-zinc-50 px-5 py-3 text-zinc-700", className)}>{children}</td>;
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "red"; children: ReactNode }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
