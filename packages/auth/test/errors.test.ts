import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { emailLayout } from "../src/email";
import { authErrorMessage } from "../src/errors";

describe("authErrorMessage", () => {
  it("traduz códigos conhecidos do Better Auth", () => {
    const err = new APIError("UNAUTHORIZED", { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(authErrorMessage(err)).toBe("E-mail ou senha incorretos.");
  });

  it("usa a mensagem original para códigos desconhecidos", () => {
    const err = new APIError("BAD_REQUEST", { message: "Algo específico", code: "OUTRO" });
    expect(authErrorMessage(err)).toBe("Algo específico");
  });

  it("não vaza detalhes de erros que não são da autenticação", () => {
    expect(authErrorMessage(new Error("connection refused 10.0.0.5"))).toBe("Não foi possível concluir. Tente de novo.");
  });
});

describe("emailLayout", () => {
  it("inclui o botão e o link em texto", () => {
    const html = emailLayout("Título", "Corpo", { label: "Entrar", url: "https://exemplo.dev/x" });
    expect(html).toContain("Título");
    expect(html.match(/https:\/\/exemplo\.dev\/x/g)).toHaveLength(2);
  });
});
