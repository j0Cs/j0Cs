# Forja (nome provisório)

Plataforma brasileira para **criar sistemas, automatizar tarefas e gerir projetos de desenvolvimento com vários
modelos de IA num lugar só**: Claude (Fable, Opus, Sonnet, Haiku), GPT (Astra, Sol, Terra, Luna), Gemini e Grok.
O cliente assina um plano em reais, recebe créditos todo mês e usa o modelo que quiser, vendo o custo de cada resposta.

São dois produtos sobre o mesmo núcleo:

| App | Para quem | O que faz |
|---|---|---|
| `apps/web` (porta 3000) | Cliente | Projetos, chat multi-modelo com streaming, conectores (GitHub, Vercel, Supabase, Postgres), custos e plano |
| `apps/admin` (porta 3001) | Dono da plataforma | MRR, custo de API x receita, margem por cliente, chaves de API, catálogo e preços, planos, câmbio |

## Documentação

1. [Visão e escopo](docs/01-visao-e-escopo.md): o produto, o público e o que entra no lançamento
2. [Arquitetura](docs/02-arquitetura.md): como as peças se ligam, as decisões e a segurança
3. [Precificação e unit economics](docs/03-precificacao-e-unit-economics.md): planos, margens e por que não vender "ilimitado"
4. [Roadmap até o lançamento (jan/2027)](docs/04-roadmap-lancamento.md): sprints, riscos e checklist

## Estrutura

```
apps/
  web/        Next.js 16: área do cliente
  admin/      Next.js 16: painel do dono (deploy separado, acesso restrito)
packages/
  core/       Gateway de IA, adaptadores dos provedores, precificação, criptografia (testado)
  db/         Schema Postgres (Drizzle), migrações, seed, consultas dos painéis
  ui/         Componentes visuais compartilhados (Tailwind v4)
docs/         Plano do produto
```

## Rodando localmente

Requisitos: Node 22+, pnpm 10+, Docker (ou um Postgres 16 local).

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm gen:key
```

Cole a chave gerada em `ENCRYPTION_KEY` no `.env` e defina `ADMIN_PASSWORD`. Para testar respostas reais, coloque ao
menos uma chave de provedor (ex.: `ANTHROPIC_API_KEY`) **antes** do seed: ela vai criptografada para o pool de chaves.

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

- Cliente: http://localhost:3000 (entra direto na conta demo `demo@forja.dev`, plano Pro, R$ 300 de créditos)
- Dono: http://localhost:3001 (usuário/senha do `.env`)

## Verificações

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

## Estado atual (Sprint 0, fundação)

Pronto e testado: gateway multi-provedor com streaming, cache de prompt e fallback automático; medição de tokens,
custo em US$ e cobrança em R$; extrato de créditos imutável; bloqueio por plano e por saldo; pool de chaves
criptografadas com failover; painéis do cliente e do dono; conectores com verificação da credencial.

Provisório: o login usa a conta demo (`apps/web/lib/session.ts`) e o painel do dono usa HTTP Basic (`apps/admin/proxy.ts`).
O login de verdade entra na Sprint 1. O resto está no [roadmap](docs/04-roadmap-lancamento.md).
