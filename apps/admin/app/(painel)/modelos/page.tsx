import { ALL_TIERS, formatBrl, PROVIDERS, retailBrlPerMTok, TIER_LABELS } from "@forja/core";
import { asc, getPricingSettings, schema, toCatalogModel } from "@forja/db";
import { Badge, Button, Card, CardHeader, cx, Field, inputBaseClass, inputClass, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { createModel, updateModel } from "./actions";

export const metadata = { title: "Modelos e preços" };

const small = cx(inputBaseClass, "w-20 px-2 py-1 text-xs tabular-nums");
const dollars = (micros: number) => String(micros / 1_000_000);

export default async function ModelsPage() {
  const db = await adminDb();
  const [rows, settings] = await Promise.all([
    db.select().from(schema.models).orderBy(asc(schema.models.sortOrder)),
    getPricingSettings(db),
  ]);
  const models = rows.map(toCatalogModel);

  return (
    <>
      <PageHeader
        title="Modelos e preços"
        description="Custo do provedor em US$ por 1 milhão de tokens e o markup de cada modelo. O preço ao cliente é calculado: custo × câmbio × (1 + sobrecusto) × (1 + markup)."
      />

      <Card>
        <CardHeader title="Catálogo" description="Confira os preços nas páginas oficiais dos provedores ao menos 1x por mês — eles mudam." />
        <Table>
          <thead>
            <tr>
              <Th>Modelo</Th>
              <Th>Faixa</Th>
              <Th>Entrada</Th>
              <Th>Cache leit.</Th>
              <Th>Cache escr.</Th>
              <Th>Saída</Th>
              <Th>Markup %</Th>
              <Th>Ao cliente (R$/MTok)</Th>
              <Th>Ativo</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className={cx(!m.enabled && "opacity-60")}>
                <Td>
                  <form id={`f-${m.id}`} action={updateModel}>
                    <input type="hidden" name="id" value={m.id} />
                  </form>
                  <input form={`f-${m.id}`} name="displayName" defaultValue={m.displayName} className={cx(inputBaseClass, "w-44 py-1 text-xs")} />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {m.id} · {PROVIDERS[m.providerId].name}
                    {m.pricing.longContext ? ` · tabela longa > ${Math.round(m.pricing.longContext.thresholdTokens / 1000)}K` : ""}
                  </p>
                </Td>
                <Td>
                  <select form={`f-${m.id}`} name="tier" defaultValue={m.tier} className={cx(inputBaseClass, "w-32 py-1 text-xs")}>
                    {ALL_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <input form={`f-${m.id}`} name="input" defaultValue={dollars(m.pricing.inputUsdMicrosPerMTok)} className={small} />
                </Td>
                <Td>
                  <input form={`f-${m.id}`} name="cacheRead" defaultValue={dollars(m.pricing.cacheReadUsdMicrosPerMTok)} className={small} />
                </Td>
                <Td>
                  <input form={`f-${m.id}`} name="cacheWrite" defaultValue={dollars(m.pricing.cacheWriteUsdMicrosPerMTok)} className={small} />
                </Td>
                <Td>
                  <input form={`f-${m.id}`} name="output" defaultValue={dollars(m.pricing.outputUsdMicrosPerMTok)} className={small} />
                </Td>
                <Td>
                  <input form={`f-${m.id}`} name="markupPercent" defaultValue={m.markupPercent} className={cx(small, "w-16")} />
                </Td>
                <Td className="text-xs tabular-nums">
                  {formatBrl(retailBrlPerMTok(m.pricing.inputUsdMicrosPerMTok, settings, m.markupPercent))} /{" "}
                  {formatBrl(retailBrlPerMTok(m.pricing.outputUsdMicrosPerMTok, settings, m.markupPercent))}
                </Td>
                <Td>
                  <input form={`f-${m.id}`} type="checkbox" name="enabled" defaultChecked={m.enabled} className="h-4 w-4" />
                </Td>
                <Td>
                  <Button form={`f-${m.id}`} variant="secondary" size="sm">
                    Salvar
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Adicionar modelo" description="Entra desabilitado; revise e ative quando testar. O id precisa ser exatamente o da API do provedor." />
        <form action={createModel} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="ID na API">
            <input name="id" required className={inputClass} placeholder="ex.: gpt-6.2-sol" />
          </Field>
          <Field label="Nome exibido">
            <input name="displayName" required className={inputClass} />
          </Field>
          <Field label="Provedor">
            <select name="providerId" className={inputClass}>
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Faixa">
            <select name="tier" className={inputClass}>
              {ALL_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entrada (US$/MTok)">
            <input name="input" required className={inputClass} />
          </Field>
          <Field label="Cache leitura (US$/MTok)">
            <input name="cacheRead" className={inputClass} />
          </Field>
          <Field label="Cache escrita (US$/MTok)">
            <input name="cacheWrite" className={inputClass} />
          </Field>
          <Field label="Saída (US$/MTok)">
            <input name="output" required className={inputClass} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit">Adicionar</Button> <Badge>Provedores suportados: Anthropic, OpenAI, Google, xAI</Badge>
          </div>
        </form>
      </Card>
    </>
  );
}
