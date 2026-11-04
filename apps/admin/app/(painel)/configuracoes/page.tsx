import { formatBrl } from "@forja/core";
import { getEconomics, getPricingSettings } from "@forja/db";
import { Button, Card, CardHeader, Field, inputClass, Notice, PageHeader } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { refreshFx, saveSettings } from "./actions";

export const metadata = { title: "Câmbio e taxas" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const db = await adminDb();
  const [s, e] = await Promise.all([getPricingSettings(db), getEconomics(db)]);
  const multiplier = s.fxUsdBrl * (1 + s.costOverheadPercent / 100);

  return (
    <>
      <PageHeader
        title="Câmbio e taxas"
        description="Parâmetros que transformam o custo em dólar no preço em reais. Mudanças valem para as próximas chamadas (o histórico guarda o valor usado em cada uma)."
      />
      <div className="mb-4 space-y-2">
        {ok ? <Notice tone="blue">{ok === "ptax" ? "Câmbio atualizado pela PTAX." : "Configurações salvas."}</Notice> : null}
        {erro ? <Notice tone="red">{erro}</Notice> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Precificação e premissas" description={`Hoje: US$ 1 de custo de API = ${formatBrl(multiplier)} de custo efetivo, antes do markup.`} />
          <form action={saveSettings} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Câmbio USD → BRL" hint="Use a PTAX + uma folga (o cartão internacional cobra mais que a PTAX).">
              <input name="fxUsdBrl" defaultValue={s.fxUsdBrl} className={inputClass} />
            </Field>
            <Field label="Sobrecusto sobre o custo de API (%)" hint="IOF (3,5% no cartão), spread e reserva p/ tributos de importação de serviço.">
              <input name="costOverheadPercent" defaultValue={s.costOverheadPercent} className={inputClass} />
            </Field>
            <Field label="Saldo mínimo para chamar (R$)">
              <input name="minBalance" defaultValue={s.minBalanceBrlMicros / 1e6} className={inputClass} />
            </Field>
            <div />
            <Field label="Impostos sobre faturamento (%)" hint="Simples Nacional/Presumido — confirme com seu contador.">
              <input name="revenueTaxPercent" defaultValue={e.revenueTaxPercent} className={inputClass} />
            </Field>
            <Field label="Taxa do gateway de pagamento (%)">
              <input name="paymentFeePercent" defaultValue={e.paymentFeePercent} className={inputClass} />
            </Field>
            <Field label="Markup médio para o simulador (%)">
              <input name="blendedMarkupPercent" defaultValue={e.blendedMarkupPercent} className={inputClass} />
            </Field>
            <Field label="Infra por assento/mês (R$)" hint="Hospedagem, banco, sandboxes, e-mail, monitoramento.">
              <input name="infraPerSeat" defaultValue={e.infraPerSeatBrlCents / 100} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Atualizar câmbio" description="Busca a PTAX de venda no Banco Central e aplica a folga." />
          <form action={refreshFx} className="space-y-4 p-5">
            <Field label="Folga sobre a PTAX (%)">
              <input name="buffer" defaultValue={3} className={inputClass} />
            </Field>
            <Button type="submit" variant="secondary" className="w-full">
              Buscar PTAX agora
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
