import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { executarFerramenta } from "../src/ferramentas";
import { assinarEstado, jwtDoApp, lerEstado, normalizarChavePrivada } from "../src/github";
import { extrairTarGz, normalizarCaminho, Workspace } from "../src/workspace";
import { tarGz } from "./tar-gz";

describe("cópia do repositório", () => {
  it("extrai o tarball do GitHub sem a pasta raiz, com nome longo", () => {
    const longo = `src/${"pasta-com-nome-bem-comprido/".repeat(4)}arquivo.ts`;
    const { arquivos } = extrairTarGz(tarGz({ "package.json": "{}", "src/index.ts": "export {}", [longo]: "x" }));
    expect([...arquivos.keys()].sort()).toEqual(["package.json", "src/index.ts", longo].sort());
    expect(arquivos.get("src/index.ts")!.toString()).toBe("export {}");
  });

  it("arquivo acima de 1 MB entra só pelo nome", () => {
    const { arquivos, grandes } = extrairTarGz(tarGz({ "grande.bin": Buffer.alloc(1_100_000, 1), "ok.txt": "ok" }));
    expect(grandes.has("grande.bin")).toBe(true);
    expect(arquivos.has("grande.bin")).toBe(false);
  });

  it("caminhos perigosos são recusados", () => {
    for (const ruim of ["../x", "a/../../b", ".git/config", "", "a//b", "/"]) expect(() => normalizarCaminho(ruim)).toThrow();
    expect(normalizarCaminho("./src/app/page.tsx")).toBe("src/app/page.tsx");
    expect(normalizarCaminho("/README.md")).toBe("README.md");
  });
});

describe("ferramentas", () => {
  const novo = () =>
    new Workspace(
      new Map([
        ["src/app/page.tsx", Buffer.from("export default function Page() {\n  return <h1>Oi</h1>;\n}\n")],
        ["src/app/layout.tsx", Buffer.from("export default function L({ children }) { return children }\n")],
        ["logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2])],
      ]),
    );
  const chamar = (ws: Workspace, name: string, input: Record<string, unknown>) => executarFerramenta(ws, { id: "1", name, input });

  it("lista, lê com linhas numeradas e busca", () => {
    const ws = novo();
    expect(chamar(ws, "listar_arquivos", {}).output.split("\n")).toEqual(["logo.png", "src/app/layout.tsx", "src/app/page.tsx"]);
    expect(chamar(ws, "ler_arquivo", { caminho: "src/app/page.tsx" }).output).toContain("    2    return <h1>Oi</h1>;");
    expect(chamar(ws, "buscar", { padrao: "h1" }).output).toBe("src/app/page.tsx:2: return <h1>Oi</h1>;");
    expect(chamar(ws, "ler_arquivo", { caminho: "logo.png" }).isError).toBe(true);
  });

  it("cria, edita (trecho único) e apaga; o diff mostra só o que mudou", () => {
    const ws = novo();
    expect(chamar(ws, "escrever_arquivo", { caminho: "src/app/contato/page.tsx", conteudo: "export default function C() {}\n" }).alterou).toBe(
      "src/app/contato/page.tsx",
    );
    expect(chamar(ws, "editar_arquivo", { caminho: "src/app/page.tsx", procurar: "Oi", substituir: "Olá" }).isError).toBe(false);
    expect(chamar(ws, "editar_arquivo", { caminho: "src/app/page.tsx", procurar: "naoexiste", substituir: "x" }).isError).toBe(true);
    expect(chamar(ws, "editar_arquivo", { caminho: "src/app/page.tsx", procurar: "export", substituir: "x" }).isError).toBe(false);
    chamar(ws, "apagar_arquivo", { caminho: "src/app/layout.tsx" });
    expect(ws.alteracoes().map((a) => [a.path, a.antes === null ? "novo" : a.depois === null ? "apagado" : "alterado"])).toEqual([
      ["src/app/contato/page.tsx", "novo"],
      ["src/app/layout.tsx", "apagado"],
      ["src/app/page.tsx", "alterado"],
    ]);
    expect(ws.listar()).not.toContain("src/app/layout.tsx");
  });

  it("criar e apagar o mesmo arquivo não vira mudança; reescrever igual também não", () => {
    const ws = novo();
    chamar(ws, "escrever_arquivo", { caminho: "tmp.txt", conteudo: "x" });
    chamar(ws, "apagar_arquivo", { caminho: "tmp.txt" });
    chamar(ws, "escrever_arquivo", { caminho: "src/app/layout.tsx", conteudo: "export default function L({ children }) { return children }\n" });
    expect(ws.alteracoes()).toEqual([]);
  });

  it("não escreve fora do repositório nem na .git", () => {
    const ws = novo();
    expect(chamar(ws, "escrever_arquivo", { caminho: "../fora.txt", conteudo: "x" }).isError).toBe(true);
    expect(chamar(ws, "escrever_arquivo", { caminho: ".git/hooks/pre-commit", conteudo: "x" }).isError).toBe(true);
    expect(ws.alteracoes()).toEqual([]);
  });
});

describe("GitHub App", () => {
  it("JWT do app assinado em RS256 com a chave do app (também com \\n escrito)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const jwt = jwtDoApp({ appId: "123", privateKey: pem.replace(/\n/g, "\\n") }, 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({ iat: 1_799_999_940, exp: 1_800_000_540, iss: "123" });
    expect(normalizarChavePrivada(pem)).toBe(pem.trim());
  });

  it("estado da instalação: assinado, com validade, e recusa adulteração", () => {
    process.env.BETTER_AUTH_SECRET = "segredo-de-teste";
    const agora = 1_800_000_000_000;
    const e = assinarEstado({ orgId: "org-1", userId: "u-1" }, agora);
    expect(lerEstado(e, agora + 60_000)).toEqual({ orgId: "org-1", userId: "u-1" });
    expect(lerEstado(e, agora + 31 * 60_000)).toBeNull();
    const [corpo, mac] = e.split(".");
    const outro = Buffer.from(JSON.stringify({ o: "org-2", u: "u-1", e: agora + 60_000 })).toString("base64url");
    expect(lerEstado(`${outro}.${mac}`, agora)).toBeNull();
    expect(lerEstado(`${corpo}.x${mac!.slice(1)}`, agora)).toBeNull();
  });
});
