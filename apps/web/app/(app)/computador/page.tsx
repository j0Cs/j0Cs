import { PageHeader } from "@forja/ui";
import { getSession } from "@/lib/session";
import { Computador } from "./computador";

export const metadata = { title: "Este computador" };

export default async function ComputadorPage() {
  await getSession();
  return (
    <>
      <PageHeader
        title="Este computador"
        description="O que a Forja faz direto na sua máquina, pelo app para computador: ler uma pasta de projeto, instalar o time de especialistas nos arquivos e ligar a telemetria do Claude Code, do Codex e do Gemini CLI. Nada é gravado sem você confirmar."
      />
      <Computador />
    </>
  );
}
