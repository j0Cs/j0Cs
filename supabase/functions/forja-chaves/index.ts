/**
 * Entrega à Forja as chaves dos provedores de IA guardadas nos Secrets das Edge Functions deste
 * projeto (Supabase → Edge Functions → Secrets). Só responde para quem envia a chave secreta do
 * projeto (a mesma que a integração Supabase ↔ Vercel cadastrou nos apps).
 *
 * Publicada com verify_jwt = false: a autenticação é a comparação abaixo.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOMES: Record<string, string[]> = {
  anthropic: ["CLAUDE_KEY", "ANTHROPIC_API_KEY"],
  openai: ["OPENAI_KEY", "OPENAI_API_KEY"],
  google: ["GEMINI_API", "GEMINI_API_KEY"],
  xai: ["GROK_API", "XAI_API_KEY"],
};

/** Outros segredos da Forja que podem ficar aqui (só estes nomes saem). */
const OUTROS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  // conciliação de custos (APIs de administração dos provedores)
  "ANTHROPIC_ADMIN_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "OPENAI_ADMIN_KEY",
  "OPENAI_PROJECT_ID",
  // envio de e-mail pelo Microsoft 365 (doc 5)
  "MS_TENANT_ID",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "EMAIL_FROM",
];

/** Chaves que autorizam a chamada: a service_role (legada) e as chaves secretas novas (sb_secret_). */
function chavesDoProjeto(): string[] {
  const lista: string[] = [];
  const legada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legada) lista.push(legada);
  try {
    const novas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    for (const v of Object.values(novas)) if (typeof v === "string" && v) lista.push(v);
  } catch {
    // sem chaves novas no projeto
  }
  return lista;
}

async function resumo(texto: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

/** Comparação em tempo constante (sobre o SHA-256, que tem tamanho fixo). */
async function igual(a: string, b: string) {
  const [x, y] = await Promise.all([resumo(a), resumo(b)]);
  let diferenca = 0;
  for (let i = 0; i < x.length; i++) diferenca |= x[i]! ^ y[i]!;
  return diferenca === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const auth = req.headers.get("authorization") ?? "";
  const recebida = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  let autorizado = false;
  if (recebida) for (const k of chavesDoProjeto()) if (await igual(recebida, k)) autorizado = true;
  if (!autorizado) return new Response("Não autorizado.", { status: 401 });

  const chaves: Record<string, { nome: string; valor: string } | null> = {};
  for (const [provedor, nomes] of Object.entries(NOMES)) {
    const nome = nomes.find((n) => (Deno.env.get(n) ?? "").trim());
    chaves[provedor] = nome ? { nome, valor: Deno.env.get(nome)!.trim() } : null;
  }
  const segredos: Record<string, string> = {};
  for (const nome of OUTROS) {
    const v = (Deno.env.get(nome) ?? "").trim();
    if (v) segredos[nome] = v;
  }
  return new Response(JSON.stringify({ chaves, segredos }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
