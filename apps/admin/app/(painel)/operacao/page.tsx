import { chaveAtiva, chavesPresentes, digitalDaChave } from "@forja/core/server";
import { inventarioDeCifras, metaDoBackup, situacaoDoBackup } from "@forja/ops";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { GerarAcessoDoBackup, GerarChaveDeCriptografia, GerarChavesDoBackup, GerarSegredo, Recifrar, TrocarSenha } from "./ferramentas";

export const metadata = { title: "Backup e chaves" };

const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const LOCAIS = { chaves_de_api: "Chaves de API (painel e BYOK)", conectores: "Tokens dos conectores", senhas_de_banco: "Senhas de banco (Supabase do cliente)" };

export default async function OperacaoPage() {
  const db = await adminDb();
  const [backup, inventario] = await Promise.all([metaDoBackup(db), inventarioDeCifras(db)]);
  const sit = situacaoDoBackup(backup);
  const ativa = chaveAtiva();
  const presentes = chavesPresentes();
  const foraDaAtiva = Object.values(inventario).reduce((s, porChave) => s + Object.entries(porChave).filter(([k]) => k !== String(ativa)).reduce((x, [, n]) => x + n, 0), 0);

  return (
    <>
      <PageHeader
        title="Backup e chaves"
        description="Cópia diária do banco fora do Supabase e a chave que cifra os segredos guardados. O passo a passo, inclusive o plano de incidente, está no doc 10."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Backup diário"
            description="GitHub Actions, todo dia às 03:47: copia o banco, restaura num Postgres separado para conferir e guarda a cópia cifrada por 30 dias."
            actions={
              <Badge tone={sit.tipo === "ok" ? "green" : sit.tipo === "nao_configurado" ? "amber" : "red"}>
                {sit.tipo === "ok" ? "em dia" : sit.tipo === "nao_configurado" ? "não configurado" : sit.tipo === "falhou" ? "falhou" : "atrasado"}
              </Badge>
            }
          />
          <div className="space-y-4 p-5 text-sm">
            {backup ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-zinc-700">
                <dt className="text-zinc-500">Última execução</dt>
                <dd>{quando(backup.em)}</dd>
                <dt className="text-zinc-500">Resultado</dt>
                <dd>{backup.detalhe}</dd>
                {backup.ok && backup.tabelas ? (
                  <>
                    <dt className="text-zinc-500">Conferência</dt>
                    <dd>
                      {backup.tabelas} tabelas restauradas e conferidas{backup.tamanhoBytes ? ` · ${(backup.tamanhoBytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB cifrado` : ""}
                    </dd>
                  </>
                ) : null}
                {backup.execucao ? (
                  <>
                    <dt className="text-zinc-500">Log</dt>
                    <dd>
                      <a href={backup.execucao} target="_blank" rel="noreferrer" className="font-medium underline">
                        abrir no GitHub
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <Notice>
                O backup ainda não rodou. São três passos (doc 10): gere o par de chaves e o acesso ao banco abaixo, cadastre os dois no GitHub e rode o
                workflow <b>Backup diário</b> uma vez.
              </Notice>
            )}
            <div className="flex flex-col items-start gap-4">
              <GerarChavesDoBackup />
              <GerarAcessoDoBackup />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Chave de criptografia"
            description="Cifra as chaves de API, os tokens dos conectores e as senhas de banco. Para trocar não é preciso ler a antiga: cria-se a próxima."
          />
          <div className="space-y-4 p-5 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-zinc-700">
              <dt className="text-zinc-500">Chave ativa</dt>
              <dd>
                <code>{ativa === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_${ativa}`}</code> · digital <code>{digitalDaChave(ativa)}</code>
              </dd>
              <dt className="text-zinc-500">Presentes neste projeto</dt>
              <dd>{presentes.map((n) => (n === 1 ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_${n}`)).join(", ")}</dd>
            </dl>
            <Table>
              <thead>
                <tr>
                  <Th>Onde</Th>
                  <Th>Por chave</Th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(LOCAIS) as (keyof typeof LOCAIS)[]).map((l) => (
                  <tr key={l}>
                    <Td>{LOCAIS[l]}</Td>
                    <Td className="text-xs">
                      {Object.entries(inventario[l]).length
                        ? Object.entries(inventario[l])
                            .map(([k, n]) => `${n} na ${k === "desconhecida" ? "chave desconhecida" : `chave ${k}`}`)
                            .join(" · ")
                        : "nenhum"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {foraDaAtiva ? <Notice>{foraDaAtiva} segredo(s) ainda em chave antiga. Clique em Recifrar.</Notice> : null}
            <div className="flex flex-col items-start gap-4">
              <GerarChaveDeCriptografia />
              <Recifrar />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Senha do painel" description="A senha inicial veio do ADMIN_PASSWORD. Troque por uma só sua; as outras sessões do painel são encerradas." />
          <div className="p-5">
            <TrocarSenha />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Segredos de produção"
            description="Para trocar BETTER_AUTH_SECRET, CRON_SECRET e outros (doc 10): o valor é gerado no seu navegador e vai direto para a Vercel."
          />
          <div className="p-5">
            <GerarSegredo />
          </div>
        </Card>
      </div>
    </>
  );
}
