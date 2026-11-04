import { listMembers, listPendingInvitations, seatUsage } from "@forja/db";
import { Badge, Button, buttonClass, Card, CardHeader, cx, Field, inputClass, PageHeader, Table, Td, Th } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { canManage, getSession } from "@/lib/session";
import { switchOrg } from "../actions";
import { inviteAction, removeMemberAction, revokeInviteAction } from "./actions";

export const metadata = { title: "Equipe" };

const ROLE_LABEL = { owner: "Dono", admin: "Administrador", member: "Membro" } as const;

export default async function TeamPage() {
  const { db, org, role, user, orgs } = await getSession();
  const [members, invites, seats] = await Promise.all([
    listMembers(db, org.id),
    listPendingInvitations(db, org.id),
    seatUsage(db, org.id),
  ]);
  const manage = canManage(role);

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem participa desta organização. Todos usam o mesmo saldo de créditos; o consumo de cada um aparece em Custos."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Membros de ${org.name}`} description={`${seats.used} de ${seats.limit} assento(s) em uso (inclui convites pendentes)`} />
          <Table>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Papel</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <Td>
                    <p className="font-medium text-zinc-900">
                      {m.name} {m.userId === user.id ? <span className="text-xs text-zinc-400">(você)</span> : null}
                    </p>
                    <p className="text-xs text-zinc-500">{m.email}</p>
                  </Td>
                  <Td>{m.role === "owner" ? <Badge tone="brand">{ROLE_LABEL.owner}</Badge> : <Badge>{ROLE_LABEL[m.role]}</Badge>}</Td>
                  <Td className="text-right">
                    {manage && m.userId !== user.id ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <Button variant="ghost" size="sm">
                          Remover
                        </Button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
              {invites.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <p className="text-zinc-700">{i.email}</p>
                    <p className="text-xs text-zinc-500">convite expira em {i.expiresAt.toLocaleDateString("pt-BR")}</p>
                  </Td>
                  <Td>
                    <Badge tone="amber">Convite pendente</Badge>
                  </Td>
                  <Td className="text-right">
                    {manage ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button variant="ghost" size="sm">
                          Cancelar
                        </Button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          {manage ? (
            <Card>
              <CardHeader title="Convidar pessoa" description="Ela recebe um link por e-mail, válido por 7 dias." />
              <div className="p-5">
                <ActionForm action={inviteAction} submit="Enviar convite" pending="Enviando…">
                  <Field label="E-mail">
                    <input name="email" type="email" required className={inputClass} />
                  </Field>
                  <Field label="Papel" hint="Administradores convidam pessoas e gerenciam conectores.">
                    <select name="role" className={inputClass} defaultValue="member">
                      <option value="member">Membro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </Field>
                </ActionForm>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Suas organizações" />
            <div className="space-y-2 p-5">
              {orgs.map((o) => (
                <form key={o.org.id} action={switchOrg} className="flex items-center justify-between gap-2 text-sm">
                  <input type="hidden" name="orgId" value={o.org.id} />
                  <span className={cx("truncate", o.org.id === org.id && "font-medium")}>
                    {o.org.name} <span className="text-xs text-zinc-400">{ROLE_LABEL[o.role]}</span>
                  </span>
                  {o.org.id === org.id ? <Badge tone="green">Ativa</Badge> : <Button variant="secondary" size="sm">Usar</Button>}
                </form>
              ))}
              <Link href="/onboarding?nova=1" className={cx(buttonClass("ghost", "sm"), "mt-2 w-full")}>
                + Criar outra organização
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
