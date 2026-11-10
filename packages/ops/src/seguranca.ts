/**
 * Rotação da chave de criptografia: recifra todos os segredos guardados com a chave ativa
 * (ENCRYPTION_KEY_<maior número>). Os valores que não abrem ficam como estão e são listados.
 */
import { chaveAtiva, chaveDoValor, decryptSecret, encryptSecret } from "@forja/core/server";
import { eq, schema, type Db } from "@forja/db";

type Local = "chaves_de_api" | "conectores" | "senhas_de_banco";

interface Item {
  local: Local;
  id: string;
  valor: string;
  gravar: (novo: string) => Promise<void>;
}

async function itens(db: Db): Promise<Item[]> {
  const lista: Item[] = [];
  for (const k of await db.select({ id: schema.providerKeys.id, v: schema.providerKeys.encryptedKey }).from(schema.providerKeys)) {
    lista.push({
      local: "chaves_de_api",
      id: k.id,
      valor: k.v,
      gravar: async (novo) => void (await db.update(schema.providerKeys).set({ encryptedKey: novo }).where(eq(schema.providerKeys.id, k.id))),
    });
  }
  for (const c of await db.select().from(schema.connectors)) {
    lista.push({
      local: "conectores",
      id: c.id,
      valor: c.encryptedCredentials,
      gravar: async (novo) => void (await db.update(schema.connectors).set({ encryptedCredentials: novo }).where(eq(schema.connectors.id, c.id))),
    });
    const criados = Array.isArray(c.metadata.projetosCriados) ? (c.metadata.projetosCriados as { ref: string; senhaDoBanco?: string }[]) : [];
    criados.forEach((p, i) => {
      if (!p.senhaDoBanco) return;
      lista.push({
        local: "senhas_de_banco",
        id: `${c.id}:${p.ref}`,
        valor: p.senhaDoBanco,
        gravar: async (novo) => {
          // relê o conector para não perder outra mudança no metadata
          const atual = await db.query.connectors.findFirst({ where: eq(schema.connectors.id, c.id) });
          if (!atual) return;
          const lista2 = [...((atual.metadata.projetosCriados as { ref: string; senhaDoBanco?: string }[]) ?? [])];
          if (lista2[i]?.ref !== p.ref) return;
          lista2[i] = { ...lista2[i]!, senhaDoBanco: novo };
          await db.update(schema.connectors).set({ metadata: { ...atual.metadata, projetosCriados: lista2 } }).where(eq(schema.connectors.id, c.id));
        },
      });
    });
  }
  return lista;
}

/** Quantos segredos estão em cada chave, por local (para o painel). */
export async function inventarioDeCifras(db: Db) {
  const porLocal: Record<Local, Record<string, number>> = { chaves_de_api: {}, conectores: {}, senhas_de_banco: {} };
  for (const it of await itens(db)) {
    const n = chaveDoValor(it.valor);
    const rotulo = n === null ? "desconhecida" : String(n);
    porLocal[it.local][rotulo] = (porLocal[it.local][rotulo] ?? 0) + 1;
  }
  return porLocal;
}

export async function recifrarSegredos(db: Db) {
  const ativa = chaveAtiva();
  let recifrados = 0;
  let jaNaAtiva = 0;
  const falhas: { local: Local; id: string; erro: string }[] = [];
  for (const it of await itens(db)) {
    if (chaveDoValor(it.valor) === ativa) {
      jaNaAtiva++;
      continue;
    }
    let aberto: string;
    try {
      aberto = decryptSecret(it.valor);
    } catch (e) {
      falhas.push({ local: it.local, id: it.id, erro: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const novo = encryptSecret(aberto);
    if (decryptSecret(novo) !== aberto) throw new Error("Conferência da nova cifra falhou: nada mais foi alterado.");
    await it.gravar(novo);
    recifrados++;
  }
  return { ativa, recifrados, jaNaAtiva, falhas };
}
