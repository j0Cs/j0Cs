import { CabecalhoDoSite, RodapeDoSite } from "@/components/site/cabecalho";
import { EscolhaDoInstalador } from "./escolha";

export const metadata = { title: "Baixar o app", description: "A Forja para macOS (Apple Silicon e Intel) e Windows." };

const NO_COMPUTADOR = [
  ["Abrir uma pasta de projeto", "Estrutura e varredura de segurança sem GitHub. Os arquivos não saem da sua máquina."],
  ["Instalar o time nos arquivos", "Dev Sênior, Dev Pleno, QA e Cyber Security viram subagentes e instruções do seu assistente."],
  ["Telemetria com um clique", "Liga o envio de uso do Claude Code, do Codex e do Gemini CLI, mostrando antes o que muda."],
  ["Entrar pelo navegador", "O app usa a conta que já está aberta no seu navegador. Sem digitar a senha de novo."],
];

export default function BaixarPage() {
  return (
    <div className="acesso relative flex min-h-dvh flex-col">
      <CabecalhoDoSite />
      <main className="relative mx-auto w-full max-w-4xl flex-1 px-6 pb-24 pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">App para computador</p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold uppercase leading-[0.9] text-aco-100">
          A Forja na <span className="text-brasa">sua máquina</span>
        </h1>
        <p className="mt-4 max-w-2xl text-aco-300">
          O mesmo produto do navegador, mais o que só dá para fazer no computador. O seu assistente de código continua rodando por conta própria, com a sua assinatura.
        </p>

        <EscolhaDoInstalador />

        <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">O que o app faz a mais</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {NO_COMPUTADOR.map(([titulo, texto]) => (
            <div key={titulo} className="border-l-2 border-aco-700 pl-4">
              <dt className="font-medium text-aco-100">{titulo}</dt>
              <dd className="mt-1 text-sm text-aco-300">{texto}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">Na primeira vez que abrir</h2>
        <p className="mt-3 max-w-2xl text-sm text-aco-300">
          Durante o beta, o app ainda não tem a assinatura digital da Apple e da Microsoft, e o sistema avisa na primeira abertura. No Mac: tente abrir, depois vá em Ajustes
          do Sistema → Privacidade e Segurança e clique em "Abrir Mesmo Assim". No Windows: clique em "Mais informações" → "Executar assim mesmo". Depois disso ele abre
          normalmente.
        </p>
      </main>
      <RodapeDoSite />
    </div>
  );
}
