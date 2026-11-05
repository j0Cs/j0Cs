import { caminhoInterno, isGithubLoginEnabled } from "@forja/auth";
import { buttonClass, Field, inputClass, Notice } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
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
      <h1 className="text-lg font-semibold">Entrar</h1>
      <p className="mb-5 text-sm text-zinc-500">Bem-vindo de volta.</p>
      {senha ? (
        <div className="mb-4">
          <Notice tone="blue">Senha alterada. Entre com a nova senha.</Notice>
        </div>
      ) : null}

      {isGithubLoginEnabled() ? (
        <>
          <form action={githubAction}>
            <input type="hidden" name="next" value={after} />
            <button className={`${buttonClass("secondary")} w-full`}>Continuar com GitHub</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" /> ou <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </>
      ) : null}

      <ActionForm action={signInAction} submit="Entrar" pending="Entrando…">
        <input type="hidden" name="next" value={after} />
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
      </ActionForm>
      <div className="mt-3 flex justify-between text-xs">
        <Link href="/recuperar-senha" className="text-zinc-500 hover:text-zinc-900">
          Esqueci a senha
        </Link>
        <Link href={convite ? `/cadastro?convite=${convite}` : "/cadastro"} className="font-medium text-zinc-900">
          Criar conta
        </Link>
      </div>

      <details className="mt-6 border-t border-zinc-100 pt-4 text-sm">
        <summary className="cursor-pointer text-zinc-600">Receber link de acesso por e-mail</summary>
        <ActionForm action={magicLinkAction} submit="Enviar link" pending="Enviando…" variant="secondary" className="mt-3 space-y-3">
          <input type="hidden" name="next" value={after} />
          <input name="email" type="email" placeholder="seu@email.com" required className={inputClass} />
        </ActionForm>
      </details>
    </>
  );
}
