import { caminhoInterno, isGithubLoginEnabled } from "@forja/auth";
import { AvisoAcesso, buttonClass, CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DivisoriaOu, TituloDeAcesso } from "@/components/acesso/titulo";
import { getAuthUser } from "@/lib/session";
import { githubAction, magicLinkAction, signInAction } from "../actions";

export const metadata = { title: "Entrar" };

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string | string[]; senha?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const convite = primeiro(params.convite);
  const senha = primeiro(params.senha);
  const next = primeiro(params.next);
  // o "voltar para" vem da URL: só caminhos deste site (vale também para quem já está logado)
  const after = caminhoInterno(convite ? `/convite/${encodeURIComponent(convite)}` : next);
  if (await getAuthUser()) redirect(after);

  return (
    <>
      <TituloDeAcesso sub="Use o e-mail e a senha da sua conta.">Entrar</TituloDeAcesso>
      {senha ? (
        <div className="mb-5">
          <AvisoAcesso tom="info">Senha alterada. Entre com a senha nova.</AvisoAcesso>
        </div>
      ) : null}

      {isGithubLoginEnabled() ? (
        <>
          <form action={githubAction}>
            <input type="hidden" name="next" value={after} />
            <button className={`${buttonClass("aco")} w-full py-2.5 text-[15px]`}>Continuar com GitHub</button>
          </form>
          <DivisoriaOu />
        </>
      ) : null}

      <ActionForm action={signInAction} submit="Entrar" pending="Entrando…" tema="acesso" className="space-y-5">
        <input type="hidden" name="next" value={after} />
        <CampoAcesso label="E-mail">
          <input name="email" type="email" autoComplete="email" required className={inputAcessoClass} />
        </CampoAcesso>
        <CampoAcesso label="Senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/recuperar-senha" className={linkAcessoClass()}>
          Esqueci a senha
        </Link>
        <Link href={convite ? `/cadastro?convite=${convite}` : "/cadastro"} className={linkAcessoClass(true)}>
          Criar conta
        </Link>
      </div>

      <details className="group mt-8 border-t border-aco-800 pt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm font-mono text-[11px] uppercase tracking-[0.2em] text-aco-300 hover:text-aco-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-revenido">
          Entrar com link por e-mail
          <span aria-hidden className="transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <ActionForm action={magicLinkAction} submit="Enviar link" pending="Enviando…" tema="acesso" variant="aco" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={after} />
          <input name="email" type="email" placeholder="seu@email.com.br" aria-label="E-mail para receber o link" required className={inputAcessoClass} />
        </ActionForm>
      </details>
    </>
  );
}
