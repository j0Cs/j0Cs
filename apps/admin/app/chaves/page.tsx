import { PROVIDERS, type ProviderId } from "@forja/core";
import { asc, isNull, schema } from "@forja/db";
import { Badge, Button, Card, CardHeader, cx, EmptyState, Field, inputBaseClass, inputClass, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { addKey, deleteKey, setPriority, toggleKey } from "./actions";

export const metadata = { title: "Chaves de API" };

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const db = await adminDb();
  const keys = await db
    .select()
    .from(schema.providerKeys)
    .where(isNull(schema.providerKeys.orgId))
    .orderBy(asc(schema.providerKeys.providerId), asc(schema.providerKeys.priority));

  return (
    <>
      <PageHeader
        title="Chaves de API"
        description="Pool de chaves da plataforma. O gateway usa a de menor prioridade e, se ela falhar antes de responder (limite, indisponibilidade), tenta a próxima automaticamente."
      />
      <div className="mb-4 space-y-2">
        {erro ? <Notice tone="red">{erro}</Notice> : null}
        {ok ? <Notice tone="blue">Chave verificada e salva ({ok}).</Notice> : null}
        <Notice tone="blue">
          Use sempre chaves de <b>API comercial</b> (console de cada provedor), nunca contas de assinatura pessoal (Claude Pro, ChatGPT Plus…):
          revender acesso de conta pessoal viola os termos de uso e leva a bloqueio. As chaves são criptografadas com AES-256-GCM e nunca voltam
          para a tela.
        </Notice>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Chaves cadastradas" />
          {keys.length === 0 ? (
            <EmptyState title="Nenhuma chave" description="Adicione ao menos uma chave por provedor que você quer oferecer." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Provedor</Th>
                  <Th>Rótulo</Th>
                  <Th>Prioridade</Th>
                  <Th>Último uso</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <Td className="font-medium text-zinc-900">{PROVIDERS[k.providerId as ProviderId].name}</Td>
                    <Td>
                      {k.label} <span className="text-xs text-zinc-400">{k.keyHint}</span>
                    </Td>
                    <Td>
                      <form action={setPriority} className="flex gap-1">
                        <input type="hidden" name="id" value={k.id} />
                        <input name="priority" defaultValue={k.priority} className={cx(inputBaseClass, "w-16 py-1 text-xs")} />
                        <Button variant="ghost" size="sm">
                          ok
                        </Button>
                      </form>
                    </Td>
                    <Td className="text-xs">{k.lastUsedAt ? k.lastUsedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</Td>
                    <Td>{k.status === "active" ? <Badge tone="green">ativa</Badge> : <Badge>desativada</Badge>}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <form action={toggleKey}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="status" value={k.status === "active" ? "disabled" : "active"} />
                          <Button variant="secondary" size="sm">
                            {k.status === "active" ? "Desativar" : "Ativar"}
                          </Button>
                        </form>
                        <form action={deleteKey}>
                          <input type="hidden" name="id" value={k.id} />
                          <Button variant="danger" size="sm">
                            Excluir
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Adicionar chave" description="Testamos a chave no provedor antes de salvar." />
          <form action={addKey} className="space-y-4 p-5">
            <Field label="Provedor">
              <select name="providerId" className={inputClass}>
                {Object.entries(PROVIDERS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rótulo">
              <input name="label" className={inputClass} placeholder="ex.: Produção 1" />
            </Field>
            <Field label="Chave">
              <input name="apiKey" type="password" autoComplete="off" required className={inputClass} />
            </Field>
            <Field label="Prioridade" hint="Menor = usada primeiro.">
              <input name="priority" defaultValue={100} className={inputClass} />
            </Field>
            <Button type="submit" className="w-full">
              Verificar e salvar
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
