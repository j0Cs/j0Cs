import { formatarDocumento, formatarTelefone, formatBrlMicros, TRIAL_PLAN_ID } from "@forja/core";
import { buttonClass, CampoAcesso, cx, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { LigarDuasEtapas } from "@/components/acesso/duas-etapas";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { canManage, getAuthUser, getSession } from "@/lib/session";
import { concluirBoasVindasAction, salvarEmpresaAction, salvarUsoAction } from "./actions";

export const metadata = { title: "Boas-vindas" };

const ETAPAS = ["Sua empresa", "Como vai usar", "Segurança", "Seus números"];
const selectClass = `${inputAcessoClass} appearance-none`;

const USOS = [
  { valor: "gestao", titulo: "Com as minhas contas de IA", texto: "Já pago Claude, ChatGPT, Gemini ou Grok. Quero ver o gasto, economizar e ter revisão de QA." },
  { valor: "construcao", titulo: "Quero que a Forja construa", texto: "Descrevo o sistema e o agente da Forja escreve o código e abre o pull request." },
  { valor: "ambos", titulo: "Os dois", texto: "Uso as minhas contas no dia a dia e a Forja em tarefas específicas." },
];

/** Boas-vindas em quatro etapas, logo depois do cadastro. Só a primeira é obrigatória. */
export default async function BoasVindasPage({ searchParams }: { searchParams: Promise<{ etapa?: string | string[] }> }) {
  const { org, role, plan } = await getSession();
  const user = await getAuthUser();
  const pedida = Number((await searchParams).etapa) || 1;
  const gerencia = canManage(role);
  // sem o documento, dono e administrador ficam na etapa 1; quem foi convidado começa na 3
  const minima = gerencia ? 1 : 3;
  const maxima = gerencia && !org.document ? 1 : 4;
  const etapa = Math.min(Math.max(pedida, minima), maxima);
  if (etapa !== pedida && (await searchParams).etapa) redirect(`/boas-vindas?etapa=${etapa}`);
  const duasEtapas = Boolean((user as { twoFactorEnabled?: boolean | null } | null)?.twoFactorEnabled);

  return (
    <>
      <ol className="mb-7 flex gap-1.5" aria-label={`Etapa ${etapa} de ${ETAPAS.length}`}>
        {ETAPAS.map((nome, i) => (
          <li key={nome} className="flex-1">
            <span className={cx("block h-1 rounded-full", i + 1 <= etapa ? "bg-brasa" : "bg-aco-800")} />
            <span className={cx("mt-1.5 block font-mono text-[10px] uppercase tracking-[0.14em]", i + 1 === etapa ? "text-aco-100" : "text-aco-300")}>{nome}</span>
          </li>
        ))}
      </ol>

      {etapa === 1 ? (
        <>
          <TituloDeAcesso sub={`Para emitir cobrança e nota fiscal no nome certo, e para cada empresa ter uma conta só. Leva um minuto.`}>Sua empresa</TituloDeAcesso>
          <ActionForm action={salvarEmpresaAction} submit="Continuar" pending="Salvando…" tema="acesso" className="space-y-5">
            <CampoAcesso label="Empresa">
              <input value={org.name} readOnly aria-readonly className={`${inputAcessoClass} opacity-70`} />
            </CampoAcesso>
            <CampoAcesso label="CNPJ ou CPF" hint="Autônomo ou MEI sem CNPJ pode usar o CPF.">
              <input
                name="documento"
                inputMode="text"
                autoComplete="off"
                required
                maxLength={20}
                defaultValue={org.document ? formatarDocumento(org.document) : ""}
                placeholder="00.000.000/0000-00"
                className={inputAcessoClass}
              />
            </CampoAcesso>
            <CampoAcesso label="Telefone ou WhatsApp" hint="Para o suporte falar com você se algo travar.">
              <input
                name="telefone"
                type="tel"
                autoComplete="tel-national"
                required
                defaultValue={org.phone ? formatarTelefone(org.phone) : ""}
                placeholder="(11) 98765-4321"
                className={inputAcessoClass}
              />
            </CampoAcesso>
            <CampoAcesso label="Quantas pessoas vão usar">
              <select name="tamanho" required defaultValue={org.teamSize ?? ""} className={selectClass}>
                <option value="" disabled>
                  Escolha
                </option>
                <option value="1">Só eu</option>
                <option value="2-5">2 a 5</option>
                <option value="6-20">6 a 20</option>
                <option value="21+">Mais de 20</option>
              </select>
            </CampoAcesso>
          </ActionForm>
        </>
      ) : null}

      {etapa === 2 ? (
        <>
          <TituloDeAcesso sub="Isso define por onde a Forja começa com você. Dá para mudar depois.">Como vai usar</TituloDeAcesso>
          <ActionForm action={salvarUsoAction} submit="Continuar" pending="Salvando…" tema="acesso" className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="sr-only">Como você vai usar a Forja</legend>
              {USOS.map((u, i) => (
                <label key={u.valor} className="flex cursor-pointer gap-3 rounded-md border border-aco-700 bg-aco-850/70 p-4 has-[:checked]:border-brasa has-[:checked]:bg-brasa/10">
                  <input type="radio" name="uso" value={u.valor} required defaultChecked={org.intendedUse ? org.intendedUse === u.valor : i === 0} className="mt-1 accent-[#ff6a1a]" />
                  <span>
                    <span className="block font-medium text-aco-100">{u.titulo}</span>
                    <span className="mt-0.5 block text-sm text-aco-300">{u.texto}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </ActionForm>
          <p className="mt-4 text-sm text-aco-300">
            Usar as suas contas custa menos: veja os planos de{" "}
            <Link href="/precos" target="_blank" className={linkAcessoClass(true)}>
              Gestão
            </Link>
            .
          </p>
        </>
      ) : null}

      {etapa === 3 ? (
        <>
          <TituloDeAcesso sub="Recomendado: a conta guarda projetos, repositórios e cobrança. Com as duas etapas, só a senha não basta para entrar.">Proteja a conta</TituloDeAcesso>
          {duasEtapas ? (
            <p className="rounded-r-md border-l-2 border-revenido bg-revenido/10 px-4 py-3 text-sm text-aco-100">A verificação em duas etapas já está ativa nesta conta.</p>
          ) : (
            <LigarDuasEtapas depois="/boas-vindas?etapa=4" />
          )}
          <p className="mt-6 text-center text-sm">
            <Link href="/boas-vindas?etapa=4" className={duasEtapas ? `${buttonClass("brasa")} w-full py-2.5 text-[15px]` : linkAcessoClass()}>
              {duasEtapas ? "Continuar" : "Fazer isso depois"}
            </Link>
          </p>
        </>
      ) : null}

      {etapa === 4 ? (
        <>
          <TituloDeAcesso sub="Três números contam quase tudo. Eles ficam sempre à vista dentro da Forja.">Seus números</TituloDeAcesso>
          <dl className="space-y-3">
            <div className="rounded-md border border-aco-700 bg-aco-850/70 p-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">Saldo de créditos · canto de baixo do menu</dt>
              <dd className="mt-1 text-sm text-aco-100">
                <b className="text-lg tabular-nums">{formatBrlMicros(org.creditBalanceBrlMicros)}</b> agora{plan?.id === TRIAL_PLAN_ID ? ", do teste grátis" : ""}. Em reais: cada
                resposta dos modelos da Forja desconta o custo real dela. O detalhe por resposta está em Custos e uso.
              </dd>
            </div>
            <div className="rounded-md border border-aco-700 bg-aco-850/70 p-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">Tokens das suas IAs · menu Minhas IAs</dt>
              <dd className="mt-1 text-sm text-aco-100">
                Depois de conectar Claude, ChatGPT, Gemini ou Grok, você vê os tokens de entrada, de saída e de cache por ferramenta, modelo, dia e pessoa. Esses tokens são
                da sua conta e não gastam os créditos daqui.
              </dd>
            </div>
            <div className="rounded-md border border-aco-700 bg-aco-850/70 p-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">Como gastar menos · menu Minhas IAs</dt>
              <dd className="mt-1 text-sm text-aco-100">
                A Forja compara o seu uso com o que seria esperado e diz o que mudar: aproveitar o cache, reduzir o contexto, trocar o modelo de tarefas simples.
              </dd>
            </div>
          </dl>
          <form action={concluirBoasVindasAction} className="mt-6">
            <button className={`${buttonClass("brasa")} w-full py-2.5 text-[15px]`}>
              {org.intendedUse === "construcao" ? "Criar o primeiro projeto" : "Conectar a minha primeira IA"}
            </button>
          </form>
        </>
      ) : null}

      {etapa > minima ? (
        <p className="mt-5 text-center text-sm">
          <Link href={`/boas-vindas?etapa=${etapa - 1}`} className={linkAcessoClass()}>
            Voltar
          </Link>
        </p>
      ) : null}
    </>
  );
}
