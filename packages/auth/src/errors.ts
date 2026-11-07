import { isAPIError } from "better-auth/api";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com esse e-mail. Entre ou recupere a senha.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com esse e-mail. Entre ou recupere a senha.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "Senha longa demais.",
  INVALID_EMAIL: "E-mail inválido.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).",
  INVALID_TOKEN: "Link inválido ou expirado. Peça um novo.",
  INVALID_CODE: "Código inválido. Confira o horário do celular e tente de novo.",
  INVALID_TWO_FACTOR_COOKIE: "A verificação expirou. Entre de novo.",
  INVALID_PASSWORD: "Senha incorreta.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde alguns minutos.",
};

/** Converte erros do Better Auth em mensagens em português para a tela. */
export function authErrorMessage(err: unknown): string {
  if (isAPIError(err)) {
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code && MESSAGES[code]) return MESSAGES[code];
    if (err.status === "TOO_MANY_REQUESTS") return MESSAGES.TOO_MANY_ATTEMPTS!;
    return err.message || "Não foi possível concluir. Tente de novo.";
  }
  return "Não foi possível concluir. Tente de novo.";
}
