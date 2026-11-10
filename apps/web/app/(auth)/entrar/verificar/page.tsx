import { caminhoInterno } from "@forja/auth";
import { CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { verificarSegundaEtapaAction } from "../../actions";

export const metadata = { title: "Verificação em duas etapas" };

export default async function SegundaEtapaPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const depois = caminhoInterno((await searchParams).next);
  return (
    <>
      <TituloDeAcesso sub="Digite os 6 dígitos do seu app autenticador. Sem o celular? Use um dos códigos de backup.">Código do app</TituloDeAcesso>
      <ActionForm action={verificarSegundaEtapaAction} submit="Verificar e entrar" pending="Verificando…" tema="acesso" className="space-y-5">
        <input type="hidden" name="next" value={depois} />
        <CampoAcesso label="Código">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            className={`${inputAcessoClass} text-center font-mono text-2xl tracking-[0.4em]`}
          />
        </CampoAcesso>
      </ActionForm>
      <p className="mt-5 text-center text-sm">
        <Link href="/entrar" className={linkAcessoClass()}>
          Voltar
        </Link>
      </p>
    </>
  );
}
