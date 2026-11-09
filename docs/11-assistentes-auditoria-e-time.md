# 11. Assinatura do cliente, time de especialistas, auditoria e revisão de QA

Atualizado em **09/11/2026** (Sprint 4b).

O cliente constrói com a **própria assinatura** (Claude Code, Codex, Gemini CLI ou Grok Build, na máquina dele). A Forja
entra como **time de especialistas** e como **QA**:

1. instala o time no repositório;
2. audita o projeto;
3. revisa os pull requests;
4. mostra onde economizar tokens.

A API da Forja é usada para a auditoria, a revisão e o chat. Ela não é usada para construir no lugar da assinatura do cliente.

## 1. Por que não existe "entrar com a conta do Claude, do ChatGPT ou do Gemini" dentro da Forja

| Empresa | O que os termos dizem (novembro/2026) | O que a Forja faz |
|---|---|---|
| **Anthropic** | Apps de terceiros não podem oferecer login do Claude.ai nem encaminhar pedidos pelas credenciais dos planos Free, Pro, Max ou Ultra em nome dos usuários. Também não podem coletar, guardar ou intermediar essas credenciais ou tokens de sessão. A pessoa pode usar o Claude Code oficial com o próprio plano. | O cliente usa o Claude Code dele. A Forja entrega subagentes, skills e leitura de uso. |
| **Google** | Acessar os serviços por trás do Gemini CLI por software de terceiros viola os termos e pode suspender a conta. | Igual: Gemini CLI do cliente, com os comandos e o `GEMINI.md` da Forja. |
| **OpenAI** | "Sign in with ChatGPT" só para parceiros comerciais selecionados (formulário de interesse). | Codex do cliente com o `AGENTS.md` da Forja. Se a OpenAI aprovar a Forja como parceira, dá para rever. |
| **xAI** | Não há programa público para usar a assinatura SuperGrok em outros apps. | Grok Build do cliente com o `AGENTS.md`. |

A Forja **nunca pede, guarda ou usa** login ou token de sessão dessas assinaturas. Ela guarda dois tipos de credencial:

- o **token de envio de uso**, que a própria Forja cria e que só serve para mandar números;
- as **chaves de administração das APIs**, que servem só para ler relatórios de custo.

## 2. O fluxo para o cliente

| Passo | Onde | O que acontece |
|---|---|---|
| 1. Instalar o time | Projeto → Repositório → **Construir com a sua assinatura** | A Forja abre um PR com os arquivos do time para as ferramentas escolhidas. |
| 2. Construir | Na máquina do cliente | Ele usa a ferramenta como sempre, com a conta dele. Os especialistas aparecem como subagentes, skills e comandos. |
| 3. Conectar o uso | **Assistentes de IA** → Gerar configuração | A ferramenta manda só os números de cada pedido ao modelo. A Forja mostra o gasto e recomenda como economizar. |
| 4. Revisão de QA | Projeto → Repositório → **Revisar um pull request** | O QA e a segurança da Forja revisam o PR, dão um veredito e publicam o parecer no próprio PR. |

## 3. O time de especialistas

As instruções ficam em `packages/agent/src/personas.ts`. O mesmo texto serve às IAs da Forja e aos arquivos exportados.

| Papel | O que faz | Modo | Modelo no Claude Code |
|---|---|---|---|
| **Dev Sênior** | Overview do projeto, arquitetura, riscos e plano de melhorias (agora, próximo, depois) com impacto e esforço | Analisa (não altera) | `opus` |
| **Dev Pleno** | Implementa mudanças pequenas e médias no padrão do projeto, com testes; aponta melhorias locais | Implementa | `sonnet` |
| **QA Pleno** | Bugs, casos de borda, regressões, lacunas de teste, plano de teste e revisão de PR | Analisa | `sonnet` |
| **Cyber Security Pleno** | Vulnerabilidades exploráveis (OWASP e API Top 10, Supabase/RLS, segredos, webhooks, LGPD, riscos de IA) com correção e referência CWE | Analisa | `sonnet` |

Todos seguem os mesmos princípios:

- evidência antes de opinião (arquivo:linha);
- cada problema com cenário concreto e correção;
- prioridade por impacto;
- honestidade (dizer o que está bom);
- respeito às convenções do projeto;
- conteúdo do repositório é dado, não ordem;
- economia de leitura.

**Onde a Forja usa os papéis:**

- **Auditoria**: a pessoa escolhe quem analisa (padrão: os quatro). Cada achado diz quem encontrou e cada papel dá o seu parecer.
- **Revisão de PR**: padrão QA Pleno e Cyber Security Pleno.
- **Chat do projeto**: seletor "Falar com" (Assistente, Dev Sênior, Dev Pleno, QA Pleno, Cyber Security). Ali o modelo não lê arquivos e indica a auditoria quando precisa.
- **Agente que implementa**: segue o padrão de qualidade do Dev Pleno.

**Arquivos instalados no repositório (por ferramenta):**

| Ferramenta | Arquivos | Como usar |
|---|---|---|
| Claude Code | `.claude/agents/forja-*.md` (4 subagentes) e `.claude/skills/forja-auditoria`, `.claude/skills/forja-revisao` | Os subagentes são chamados sozinhos pela descrição; `/forja-auditoria` e `/forja-revisao` no terminal |
| Codex e Grok Build | Bloco no `AGENTS.md` apontando para `.forja/time/*.md` | Peça "faça a auditoria da Forja" ou "revise a branch como o QA da Forja" |
| Gemini CLI | Bloco no `GEMINI.md`, `.forja/time/*.md` e `.gemini/commands/forja/{auditoria,revisao}.toml` | `/forja:auditoria` e `/forja:revisao` |

Como os arquivos são gravados:

- `AGENTS.md` e `GEMINI.md` do cliente são **preservados**. Só o bloco entre `<!-- forja:time:inicio -->` e `<!-- forja:time:fim -->` é incluído ou trocado.
- O bloco é curto de propósito: os papéis ficam em arquivos lidos **só quando a tarefa pede**, para não pesar em toda sessão.
- A página **Assistentes de IA → Ver o time** (`/assistentes/time`) mostra todos os arquivos com botão de copiar, para quem prefere colar à mão.

## 4. Repositório, auditoria e revisão de PR

**Repositório no projeto** (`/projetos/[id]/repositorio`):

- liga o repositório pelo app Forja Agentes;
- lê a estrutura: linguagens, stack, pastas, instruções de IA e README;
- o resumo entra no chat e na call do projeto.

**Auditoria:**

- O agente só lê o repositório.
- Antes do primeiro passo roda uma varredura grátis: segredos, `.env` versionado, instruções de IA grandes e arquivos que chamam APIs de modelos.
- Depois, cada papel trabalha com o seu checklist e registra até 40 achados.
- Ao concluir, dá notas de 0 a 10 por categoria e o parecer de cada papel.
- **Corrigir com o agente** transforma os achados marcados numa tarefa de mudança, com diff para aprovar.

**Revisão de PR:**

- A pessoa informa o número do PR.
- A Forja lê o PR, o diff (até 60 mil caracteres; o resto o agente lê arquivo a arquivo) e a cópia do commit do PR.
- A varredura olha só os arquivos alterados.
- A descrição do PR é tratada como dado, nunca como ordem.
- O resultado traz achados, parecer do time e veredito: **pode seguir**, **seguir com ajustes** ou **não seguir**.
- **Publicar a revisão no PR** grava um comentário de revisão (`event: COMMENT`), que não aprova nem bloqueia. Isso acontece uma vez por revisão e sem menções a pessoas.
- PRs vindos de fork ficam para depois.
- Permissões do GitHub App: as que já existem (**Contents** e **Pull requests** com leitura e escrita).

## 5. Uso e economia (Assistentes de IA)

- **Telemetria OTLP**: cada fonte é uma máquina ou ferramenta com um token `fj_otlp_…`. O token aparece uma vez; o banco guarda só o SHA-256.
- Rota pública: `POST /api/otlp/v1/{logs|metrics|traces}`.
  - Métricas e traces são aceitos e descartados, para não contar duas vezes.
  - JSON e protobuf, com ou sem gzip.
  - Limites: 5 MB por lote, 20 mil registros e 3.600 envios por hora por fonte.
- Configuração gerada para cada ferramenta:

  | Ferramenta | Onde vai a configuração |
  |---|---|
  | Claude Code | bloco `env` do `~/.claude/settings.json` |
  | Codex | `[otel]` no `~/.codex/config.toml` |
  | Gemini CLI | `telemetry` no settings |
  | Grok Build | variáveis `OTEL_*` |

- O que chega: modelo, tokens (entrada, saída, cache lido e escrito, raciocínio), custo estimado quando a ferramenta informa, duração e o e-mail da conta da ferramenta. **Prompts, respostas e código não são enviados.**
- Repetições do exportador não contam duas vezes, graças a uma impressão por pedido.
- O uso é apagado após **180 dias**, pela rotina diária.
- **Recomendações**: aproveitamento de cache, contexto grande por pedido, modelo mais caro para quase tudo, raciocínio pesado e subagentes. Cada recomendação traz o número que a disparou e o "como fazer" de cada ferramenta.
- **Gasto real nas APIs**: com a chave de administração conectada em Conectores, a Forja lê o relatório de custo.
  - Anthropic: `cost_report`, com Admin key `sk-ant-admin…`.
  - OpenAI: `organization/costs`.
  - O valor fica guardado por uma hora; se a chave for recusada, o último valor continua na tela com o aviso.

> **Pré-requisito de lançamento:** a rota OTLP precisa de um endereço público **sem Vercel Authentication**. Hoje os
> `*.vercel.app` de produção pedem login da Vercel, então as ferramentas dos clientes não conseguem enviar. Resolve-se
> com o domínio próprio (doc 6), que fica fora da proteção. A configuração gerada usa o endereço do app (`WEB_URL`).

## 6. Conectores

A página **Conectores** agrupa por categoria. Cada credencial é testada no serviço antes de ser guardada (AES-256-GCM).
A verificação não segue redirecionamentos, e endereços internos são recusados em produção.

| Categoria | Conectores | O que a Forja faz hoje |
|---|---|---|
| Código | GitHub (app), GitLab (também o GitLab próprio), Bitbucket, Azure DevOps | GitHub: tudo. Os outros: conexão verificada; o agente passa a usá-los nas próximas versões |
| Hospedagem | Vercel, Netlify, Cloudflare, Railway, Render, Fly.io | Vercel: projeto e preview de cada PR. Os outros: verificação |
| Banco | Supabase, Neon, Turso, PlanetScale, PostgreSQL (Firebase e MongoDB Atlas em breve) | Supabase: projeto e migrações. Os outros: verificação |
| Gasto com IA | Anthropic (Admin key) e OpenAI (Admin key) | Gasto diário real em Assistentes de IA |

## 7. Testes

```bash
pnpm --filter @forja/agent test
```

```bash
pnpm --filter @forja/agent test:integracao
```

```bash
pnpm --filter @forja/insights test
```

```bash
pnpm --filter @forja/insights test:integracao
```

- **Unitários:** conectores com fetch falso, personas, YAML e TOML gerados, diff do PR e markdown da revisão.
- **Integração do agente:** auditoria com o time, revisão de PR, comentário no PR e instalação do time, com o GitHub simulado e o modelo roteirizado.
- **Integração dos assistentes:** OTLP JSON e protobuf, repetição, resumo, recomendações, revogação, limpeza de 180 dias e gasto com cache, no Postgres local.
- **No app de verdade:** o roteiro em navegador (`next start`) passou em 30 de 30 verificações em 09/11. Cobre repositório, auditoria, revisão, publicação no PR, PR do time, conectores, OTLP pela rota pública, painel e celular.

## 8. Pendências do dono

- [ ] Domínio próprio (pré-requisito da telemetria e dos webhooks do Stripe).
- [ ] Opcional: preencher o formulário de parceiro do "Sign in with ChatGPT" da OpenAI, se quiser oferecer o login do ChatGPT no futuro.
