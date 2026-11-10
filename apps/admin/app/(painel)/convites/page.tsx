import { stripeConfigurado } from "@forja/billing";
import { formatBrlCents } from "@forja/core";
import { desc, eq, schema, sql } from "@forja/db";
import { Badge, Button, Card, CardHeader, cx, Field, inputClass, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { criarConviteAction, revogarConviteAction } from "./actions";

export const metadata = { title: "Convites de fundador" };

/** Endereço do app do cliente, para montar o link do convite. */
const enderecoDoApp = () => (process.env.WEB_URL || "").replace(/\/+$/, "");

export default async function ConvitesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const db = await adminDb();
  const convites = await db
    .select({
      c: schema.betaInvites,
      empresas: sql<string | null>`(select string_agg(o.name, ', ' order by o.created_at) from organizations o where o.beta_invite_id = ${schema.betaInvites.id})`,
      assinantes: sql<number>`(select count(*)::int from organizations o where o.beta_invite_id = ${schema.betaInvites.id} and o.plan_id is not null and o.plan_id <> 'trial')`,
    })
    .from(schema.betaInvites)
    .orderBy(desc(schema.betaInvites.createdAt))
    .limit(200);
  const app = enderecoDoApp();
  const agora = new Date();

  return (
    <>
      <PageHeader
        title="Convites de fundador"
        description="Links do beta fechado. Cada convite dá um teste maior e, se você quiser, um desconto na assinatura por alguns meses."
      />
      <div className="mb-4 space-y-2">
        {erro ? <Notice tone="red">{erro}</Notice> : null}
        {ok ? <Notice tone="blue">{ok}</Notice> : null}
        {!app ? <Notice>Defina a variável WEB_URL no painel para os links saírem completos. Por enquanto a tabela mostra só o caminho.</Notice> : null}
      </div>

      <Card className="mb-6">
        <CardHeader title="Novo convite" description="Use um convite por empresa, ou um convite com vários usos para um grupo." />
        <form action={criarConviteAction} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <Field label="Para quem" hint="Aparece para a pessoa convidada.">
              <input name="label" required maxLength={80} placeholder="Agência Exemplo" className={inputClass} />
            </Field>
          </div>
          <Field label="Dias de teste">
            <input name="dias" inputMode="numeric" defaultValue="30" className={inputClass} />
          </Field>
          <Field label="Créditos do teste (R$)">
            <input name="creditos" inputMode="decimal" defaultValue="50" className={inputClass} />
          </Field>
          <Field label="Usos" hint="Quantas empresas podem entrar com este link.">
            <input name="usos" inputMode="numeric" defaultValue="1" className={inputClass} />
          </Field>
          <Field label="Validade (dias)" hint="0 = não vence.">
            <input name="validade" inputMode="numeric" defaultValue="30" className={inputClass} />
          </Field>
          <Field label="Desconto por mês (R$)" hint={stripeConfigurado() ? "Cria o cupom no Stripe. 0 = sem desconto." : "Precisa do Stripe configurado. Deixe 0 por enquanto."}>
            <input name="desconto" inputMode="decimal" defaultValue="0" className={inputClass} />
          </Field>
          <Field label="Meses de desconto">
            <input name="meses" inputMode="numeric" defaultValue="6" className={inputClass} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Texto da oferta (opcional)" hint="Ex.: Pro por R$ 297 nos 6 primeiros meses.">
              <input name="oferta" maxLength={160} className={inputClass} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Cupom já criado no Stripe (opcional)" hint="Se preencher, o desconto acima é ignorado e este cupom é usado.">
              <input name="cupom" maxLength={60} className={inputClass} />
            </Field>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <Button type="submit">Criar convite</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title={`Convites (${convites.length})`} />
        {convites.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-500">Nenhum convite ainda. Crie o primeiro acima e mande o link para a empresa convidada.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Para quem</Th>
                <Th>Link</Th>
                <Th>Teste</Th>
                <Th>Assinatura</Th>
                <Th>Usos</Th>
                <Th>Quem entrou</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {convites.map(({ c, empresas, assinantes }) => {
                const vencido = Boolean(c.expiresAt && c.expiresAt < agora);
                const esgotado = c.uses >= c.maxUses;
                return (
                  <tr key={c.id} className={cx((c.revokedAt || vencido) && "opacity-50")}>
                    <Td>
                      {c.label}
                      <span className="ml-2">
                        {c.revokedAt ? <Badge tone="red">revogado</Badge> : vencido ? <Badge tone="amber">vencido</Badge> : esgotado ? <Badge>usado</Badge> : <Badge tone="green">ativo</Badge>}
                      </span>
                    </Td>
                    <Td className="max-w-xs break-all font-mono text-xs">{`${app}/cadastro?fundador=${c.code}`}</Td>
                    <Td className="text-xs">
                      {c.trialDays} dias · {formatBrlCents(c.creditsBrlCents)}
                    </Td>
                    <Td className="text-xs">{c.offer ?? (c.stripeCouponId ? `cupom ${c.stripeCouponId}` : "preço normal")}</Td>
                    <Td className="tabular-nums">
                      {c.uses}/{c.maxUses}
                    </Td>
                    <Td className="text-xs">
                      {empresas ?? "—"}
                      {assinantes ? <span className="ml-1 text-green-700">({assinantes} assinando)</span> : null}
                    </Td>
                    <Td className="text-right">
                      {c.revokedAt ? null : (
                        <form action={revogarConviteAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button variant="ghost" size="sm">
                            Revogar
                          </Button>
                        </form>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
