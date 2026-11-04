import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEmailTokenCache, sendEmail } from "../src/email";

const ENV = { MS_TENANT_ID: "tenant-123", MS_CLIENT_ID: "client-abc", MS_CLIENT_SECRET: "s3cr3t", EMAIL_FROM: "nao-responda@empresa.com.br" };

function fakeFetch(sendStatus = 202) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("login.microsoftonline.com")) {
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    }
    return new Response(sendStatus === 202 ? null : "erro", { status: sendStatus });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("sendEmail (Microsoft Graph)", () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    resetEmailTokenCache();
  });
  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  it("autentica com client credentials e envia pela caixa configurada", async () => {
    const f = fakeFetch();
    await sendEmail({ to: "cliente@x.com", subject: "Oi", html: "<p>corpo</p>" }, f);

    const [tokenUrl, tokenInit] = f.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token");
    const form = new URLSearchParams(String((tokenInit as RequestInit).body));
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("scope")).toBe("https://graph.microsoft.com/.default");

    const [sendUrl, sendInit] = f.mock.calls[1]!;
    expect(String(sendUrl)).toBe("https://graph.microsoft.com/v1.0/users/nao-responda%40empresa.com.br/sendMail");
    expect((sendInit as RequestInit).headers).toMatchObject({ authorization: "Bearer tok-1" });
    const payload = JSON.parse(String((sendInit as RequestInit).body));
    expect(payload.message.toRecipients[0].emailAddress.address).toBe("cliente@x.com");
    expect(payload.message.body.contentType).toBe("HTML");
    expect(payload.saveToSentItems).toBe(false);
  });

  it("reaproveita o token entre envios", async () => {
    const f = fakeFetch();
    await sendEmail({ to: "a@x.com", subject: "1", html: "" }, f);
    await sendEmail({ to: "b@x.com", subject: "2", html: "" }, f);
    const tokenCalls = f.mock.calls.filter(([u]) => String(u).includes("login.microsoftonline.com"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("falha de forma explícita quando o Graph não aceita (ex.: caixa fora do escopo RBAC)", async () => {
    const f = fakeFetch(403);
    await expect(sendEmail({ to: "a@x.com", subject: "1", html: "" }, f)).rejects.toThrow(/403/);
  });

  it("sem configuração, em desenvolvimento, imprime no console em vez de enviar", async () => {
    for (const k of Object.keys(ENV)) delete process.env[k];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fakeFetch();
    await sendEmail({ to: "a@x.com", subject: "Teste", html: "", link: "http://localhost/x" }, f);
    expect(f).not.toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toContain("http://localhost/x");
    log.mockRestore();
  });
});
