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
  auth/       Login (Better Auth): cliente com e-mail/senha, link mágico e GitHub; dono com 2FA
  core/       Gateway de IA, adaptadores dos provedores, precificação, criptografia (testado)
  db/         Schema Postgres (Drizzle), migrações, seed, organizações e convites, consultas dos painéis
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

Rode duas vezes e cole uma chave em `ENCRYPTION_KEY` e a outra em `BETTER_AUTH_SECRET`. Defina `ADMIN_EMAIL` e
`ADMIN_PASSWORD` (sua conta do painel do dono). Para testar respostas reais, coloque ao menos uma chave de provedor
(ex.: `ANTHROPIC_API_KEY`) **antes** do seed: ela vai criptografada para o pool de chaves.

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

- Cliente: http://localhost:3000. Entre com `demo@forja.dev` / `demo12345` (plano Pro, R$ 300 de créditos, 3 assentos)
  ou crie uma conta nova em `/cadastro` (teste grátis de 7 dias com R$ 10).
- Dono: http://localhost:3001 com `ADMIN_EMAIL` / `ADMIN_PASSWORD`. No primeiro acesso o painel pede para ativar o
  2FA com um app autenticador (Google Authenticator, 1Password, Authy…).
- Sem `RESEND_API_KEY`, os e-mails (confirmação, convite, link mágico, senha) aparecem no terminal do `pnpm dev`.

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

## Estado atual (Sprints 0 e 1)

Pronto e testado: gateway multi-provedor com streaming, cache de prompt e fallback automático; medição de tokens,
custo em US$ e cobrança em R$; extrato de créditos imutável; bloqueio por plano e por saldo; pool de chaves
criptografadas com failover; painéis do cliente e do dono; conectores com verificação da credencial.
**Contas reais**: cadastro com teste grátis, confirmação de e-mail, link mágico, recuperação de senha, login com GitHub
(quando configurado), organizações, convites com limite de assentos e papéis; painel do dono só para a equipe, com
2FA obrigatório e lista opcional de IPs.

Falta da Sprint 1 (depende das suas contas): deploy de staging, chaves reais dos 4 provedores e monitoramento de erros.
O resto está no [roadmap](docs/04-roadmap-lancamento.md).
