"use client";

import { usePathname } from "next/navigation";

/** O texto grande da esquerda muda com a tela: entrar, criar conta, recuperar senha… */
const CHAMADAS: { prefixo: string; sobre?: string; linhas: [string, string]; texto: string }[] = [
  {
    prefixo: "/cadastro",
    sobre: "7 dias grátis · R$ 10 em créditos · sem cartão",
    linhas: ["Acenda", "a forja"],
    texto: "Descreva o sistema que você quer. Claude, GPT, Gemini e Grok constroem com você, e a conta vem em reais.",
  },
  {
    prefixo: "/recuperar-senha",
    sobre: "Acesso",
    linhas: ["Recupere", "o acesso"],
    texto: "Mandamos um link para o seu e-mail. Com ele, você cria uma senha nova.",
  },
  {
    prefixo: "/redefinir-senha",
    sobre: "Acesso",
    linhas: ["Senha", "nova"],
    texto: "Escolha uma senha que você não usa em outro lugar.",
  },
  {
    prefixo: "/convite",
    sobre: "Convite",
    linhas: ["Sua equipe", "te chamou"],
    texto: "Projetos, conversas e créditos ficam com o time. Entre e comece a trabalhar junto.",
  },
  {
    prefixo: "/boas-vindas",
    sobre: "Boas-vindas · 4 etapas curtas",
    linhas: ["Prepare a", "bancada"],
    texto: "Dados da empresa, como você vai usar, a proteção da conta e onde ficam os seus números. Depois disso é só trabalhar.",
  },
  {
    prefixo: "/conta",
    sobre: "Segurança",
    linhas: ["Tranque a", "oficina"],
    texto: "A conta guarda projetos, repositórios e cobrança. Com a verificação em duas etapas, só a senha não basta para entrar.",
  },
  {
    prefixo: "/desktop",
    sobre: "App para computador",
    linhas: ["A forja na", "sua máquina"],
    texto: "Confirme para o app entrar com a conta que já está aberta neste navegador.",
  },
  {
    prefixo: "/onboarding",
    sobre: "Último passo",
    linhas: ["Monte a", "oficina"],
    texto: "Cada empresa tem os próprios projetos, equipe, plano e créditos.",
  },
];
const ENTRAR: { sobre?: string; linhas: [string, string]; texto: string } = {
  linhas: ["De volta à", "oficina"] as [string, string],
  texto: "Seus projetos, conversas e o time de IAs estão onde você deixou.",
};

export function Chamada() {
  const caminho = usePathname();
  const c = CHAMADAS.find((x) => caminho.startsWith(x.prefixo)) ?? ENTRAR;
  return (
    <div key={caminho} className="anim-surgir">
      {c.sobre ? <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">{c.sobre}</p> : null}
      <p className="font-display text-[clamp(3.25rem,8.5vw,7rem)] font-extrabold uppercase leading-[0.84] tracking-[0.005em] text-aco-100">
        {c.linhas[0]}
        <br />
        <span className="text-brasa">{c.linhas[1]}</span>
      </p>
      <p className="mt-6 max-w-md text-[15px] leading-relaxed text-aco-300">{c.texto}</p>
    </div>
  );
}
