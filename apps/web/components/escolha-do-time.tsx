import { ORDEM_DAS_PERSONAS, PERSONAS, type Persona } from "@forja/agent";

/** Caixas de seleção dos papéis do time (Dev Sênior, Dev Pleno, QA Pleno, Cyber Security Pleno). */
export function EscolhaDoTime({ padrao, legenda = "Quem analisa" }: { padrao: Persona[]; legenda?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-zinc-900">{legenda}</legend>
      <div className="grid gap-2">
        {ORDEM_DAS_PERSONAS.map((p) => (
          <label key={p} className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50">
            <input type="checkbox" name="persona" value={p} defaultChecked={padrao.includes(p)} className="mt-0.5" />
            <span>
              <span className="block font-medium text-zinc-900">{PERSONAS[p].nome}</span>
              <span className="block text-xs leading-snug text-zinc-500">{PERSONAS[p].resumo}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
