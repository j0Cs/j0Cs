/** Rótulos e cores dos status da tarefa (tela e lista). */
export const STATUS_DA_TAREFA: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" | "brand" }> = {
  executando: { label: "Trabalhando", tone: "brand" },
  aguardando_aprovacao: { label: "Esperando sua aprovação", tone: "amber" },
  abrindo_pr: { label: "Abrindo o PR", tone: "brand" },
  concluida: { label: "Concluída", tone: "green" },
  parada: { label: "Parada", tone: "gray" },
  falhou: { label: "Falhou", tone: "red" },
  descartada: { label: "Descartada", tone: "gray" },
};

export const AVISOS_DO_GITHUB: Record<string, { tone: "blue" | "red" | "amber"; texto: string }> = {
  ok: { tone: "blue", texto: "GitHub conectado. Escolha o repositório e crie a primeira tarefa." },
  "sem-permissao": { tone: "red", texto: "Só donos e administradores conectam o GitHub." },
  "nao-configurado": { tone: "amber", texto: "O GitHub App da Forja ainda não foi configurado. Fale com o suporte." },
  "sem-instalacao": { tone: "red", texto: "A volta do GitHub veio sem a instalação. Comece a conexão de novo por aqui." },
  "estado-invalido": { tone: "red", texto: "A volta do GitHub não confere com esta conta (ou demorou mais de 30 minutos). Comece de novo por aqui." },
  "sem-oauth": { tone: "red", texto: "O GitHub não mandou a autorização da sua conta, então não deu para confirmar a instalação. Tente de novo." },
  "instalacao-alheia": { tone: "red", texto: "Essa instalação não aparece na sua conta do GitHub. Instale com a conta (ou organização) que você administra." },
  "oauth-recusado": { tone: "red", texto: "O GitHub recusou a autorização. Tente de novo." },
  falhou: { tone: "red", texto: "Não consegui concluir a conexão com o GitHub. Tente de novo em instantes." },
};
