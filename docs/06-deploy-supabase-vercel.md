# 6. Infraestrutura: Supabase + Vercel

**Decisão: Supabase para o banco e Vercel para os apps, os dois nos EUA (Virgínia)**: Supabase `us-east-1` e
Vercel `iad1`. Mais duas condições: a **Data API da Supabase desligada** (não usamos `supabase-js`) e **Vercel no
plano Pro** (o Hobby proíbe uso comercial e não aceita a varredura de voz a cada minuto).

## O que já está criado (nov/2026)

| Recurso | Onde | Estado |
|---|---|---|
| Banco | Supabase, projeto `jhzphlorvtheyhmjzjgm` (`us-east-1`) | migrações `0000`–`0004` aplicadas, RLS em todas as 21 tabelas |
| App do cliente | Vercel, time Rampin Technology, projeto `forja-web` (Root Directory `apps/web`) | Git ligado a `j0Cs/j0Cs`, região `iad1` |
| Painel do dono | Vercel, projeto `forja-admin` (Root Directory `apps/admin`) | Git ligado a `j0Cs/j0Cs`, região `iad1` |
| Variáveis públicas | os dois projetos | `NEXT_PUBLIC_APP_NAME=Forja`, `DATABASE_POOL_MAX=5` |

**Primeiro build (04/11, commit `f5cac4d`)**: os dois falharam como esperado, por motivos que dependem de você:

- `forja-web`: *"Hobby accounts are limited to daily cron jobs"*. O time Rampin Technology está no plano **Hobby**.
  A varredura das calls de voz roda a cada minuto e precisa do **Pro**, que também é exigido para uso comercial.
- `forja-admin`: instalou o monorepo e parou na migração (*"Defina DATABASE_URL_DIRECT ou DATABASE_URL"*), porque os
  segredos do banco ainda não foram cadastrados.
- A Vercel tratou a branch `claude/festive-galileo-oc97tw` como **produção** porque ela é a branch padrão do repositório
  no GitHub. Depois do merge do PR, troque a branch de produção para `main` (Vercel → Settings → Environments →
  Production → Branch Tracking, ou mude a branch padrão no GitHub). Até lá, cada push nessa branch é um deploy de
  produção e roda as migrações no banco.

Endereços de produção: `forja-web-rampin-tech.vercel.app` e `forja-admin-rampin-tech.vercel.app`.

Os dois projetos estão com a **Vercel Authentication** ligada para tudo, menos domínios próprios. Enquanto não houver
domínio, só membros do time Rampin abrem os endereços `.vercel.app`, o que serve como staging fechado.

## Publicação de teste no Hobby (05/11/2026)

Decisão do dono: publicar já no plano **Hobby**, para testar antes do lançamento (o Hobby não permite uso comercial).

- **Cron 1 vez por dia** (`17 6 * * *` em `apps/web/vercel.json`), porque o Hobby recusa o cron por minuto.
- **Voz em nuvem**: liga com `VOZ_NUVEM_HABILITADA=1` e uma chave da OpenAI no painel. Como o cron é diário, a
  varredura das calls abandonadas também roda a cada pulso e a cada abertura de call (no máximo uma a cada 20 s), e
  cada call tem limite de 60 minutos. Com o acesso restrito ao time, o risco de custo é baixo; no lançamento, Pro.
- **Banco pela integração Supabase ↔ Vercel**: a integração cria `POSTGRES_URL` (pooler 6543) e companhia. O código usa
  `POSTGRES_URL` quando não há `DATABASE_URL`, migra pelo mesmo pooler em modo sessão (porta 5432) e verifica o SSL com
  o certificado raiz público da Supabase (`packages/db/src/supabase-ca.ts`). A senha do banco não passa por ninguém.
- **Segredos gerados pelo Claude e cadastrados como Secret** (com autorização do dono; ficam no histórico da conversa).
  Antes do lançamento, gere novos e substitua: trocar `ENCRYPTION_KEY` é de graça enquanto nenhuma chave de API
  estiver cadastrada no painel; depois disso, as chaves precisam ser cadastradas de novo.

**Ao passar para o Pro**: volte o cron para `* * * * *` em `apps/web/vercel.json` e faça um *Redeploy*.

## Arquitetura

```
Navegador (Brasil) ──► Vercel iad1 (Virgínia) ──► Supabase us-east-1 (Virgínia)
                        ├─ forja-web   (apps/web)      pooler modo transação :6543 (runtime)
                        └─ forja-admin (apps/admin)    pooler modo sessão   :5432 (migrações)
```

- App e banco ficam na mesma região AWS: ~1–2 ms por consulta. As rotas fazem várias consultas em sequência, então
  isso pesa mais que a distância até o usuário.
- O navegador no Brasil fica a ~110–140 ms da Virgínia em cada ida e volta. Nas respostas da IA isso some no tempo do
  modelo (o streaming começa igual). Nas telas, a diferença aparece um pouco.
- O compute da Vercel nos EUA custa ~40% menos que em `gru1`.
- Os `vercel.json` dos apps fixam `iad1`. Se um dia o banco for para São Paulo, troque os dois para `gru1` **junto**
  com o banco. App e banco em regiões diferentes somam ~120 ms **por consulta**.
- O pool de conexões usa `attachDatabasePool` (Fluid compute) e consultas sem prepared statements nomeados
  (exigência do pooler em modo transação).
- **RLS ligado em todas as tabelas** (o script de migração falha se alguma ficar sem) **e** Data API desligada: defesa
  em duas camadas. O app conecta como `postgres` (dono das tabelas), que ignora o RLS.

## Passo a passo do que falta

1. **Supabase** → projeto `jhzphlorvtheyhmjzjgm`:
   - **Data API** → desligue *Enable Data API*. Isso também resolve o alerta do Advisor sobre a função
     `public.rls_auto_enable()`, que a própria Supabase cria e deixa executável pelos papéis da Data API.
   - **Database Settings → SSL** → ligue *Enforce SSL* e baixe o certificado.
2. Em **Connect**, copie (com a senha do banco que você definiu ao criar o projeto). Se a senha tiver caracteres
   especiais, escreva-os codificados na URL (`/` → `%2F`, `?` → `%3F`, `#` → `%23`, `@` → `%40`, `%` → `%25`,
   `:` → `%3A`) ou troque por uma senha só com letras e números. Uma URL inválida faz o build parar com uma
   mensagem que **não** mostra a senha.
   - *Transaction pooler* (porta **6543**) → `DATABASE_URL`
   - *Session pooler* (porta **5432**) → `DATABASE_URL_DIRECT`. A migração **se recusa** a rodar na 6543: a trava
     que impede os dois builds de migrarem juntos não funciona no modo transação.
   - O certificado do passo 1 → `DATABASE_SSL_CA`: o conteúdo do PEM numa linha só, com `\n` no lugar das quebras.
     Com ele, parâmetros `sslmode=...` na URL são ignorados de propósito, senão o `pg` descartaria o certificado.
3. **Segredos** (gere no seu terminal, um por variável, e cole na Vercel com o tipo **Secret**, o antigo "Sensitive"):

```bash
openssl rand -base64 32
```

| Variável | web | admin | Observação |
|---|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_DIRECT`, `DATABASE_SSL_CA` | ✔ | ✔ | passo 2 |
| `ENCRYPTION_KEY` | ✔ | ✔ | **o mesmo valor** nos dois (o painel cifra as chaves de API, o app decifra) |
| `BETTER_AUTH_SECRET` | ✔ | ✔ | um valor diferente em cada app |
| `CRON_SECRET` | ✔ | | a Vercel manda no cabeçalho da varredura das chamadas de voz |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | ✔ | conta inicial do painel, criada pelo seed. Troque a senha depois |
| `ADMIN_IP_ALLOWLIST` | | opcional | IPs liberados no painel, separados por vírgula |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EMAIL_FROM` | ✔ | ✔ | doc 5 / `cowork/02-microsoft-365-email.md` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | ✔ | | `cowork/01-github-login.md` |
| `WEB_URL` / `ADMIN_URL` | opcional | opcional | sem elas, cada app usa o próprio domínio de produção da Vercel (`VERCEL_PROJECT_PRODUCTION_URL`), que passa a ser o domínio próprio quando você ligar um. Se um app tiver **mais de um** domínio próprio, defina a variável com o endereço canônico (o mesmo do callback do GitHub): a Vercel escolhe o domínio mais curto |
| `ANTHROPIC_API_KEY` etc. | | | **não**: as chaves dos provedores são cadastradas no painel e ficam cifradas no banco |

   Marque só **Production** nos segredos do banco. Builds de *preview* (cada push numa branch) **não** migram nem
   rodam o seed (`VERCEL_ENV` diferente de `production`), então um preview nunca altera o banco de produção.

4. **Primeiro deploy de produção**: a branch de produção da Vercel é a `main`. Ele acontece quando o PR for
   mergeado (ou num *Redeploy* manual depois disso). Cada build de produção roda as migrações pendentes (com trava no
   banco, então os dois apps podem buildar juntos). O build do painel também roda o seed:
   - planos e modelos só são **criados** se ainda não existirem. Edições feitas no painel não voltam ao padrão a cada
     deploy. Para reaplicar os planos do código uma vez: adicione `SEED_RESET_PLANS=1` no `forja-admin`
     (Production), faça um *Redeploy* e **apague a variável** em seguida;
   - cria a conta do dono a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD` (recusa os valores de exemplo do `.env.example`);
   - **nunca** cria a conta demo na Vercel.
5. **Primeiro acesso ao painel**: entre com `ADMIN_EMAIL`/`ADMIN_PASSWORD`, ative o 2FA, cadastre as chaves dos
   provedores em **Chaves de API** e confira o câmbio. Uma chave usada por uma call de voz em andamento não pode ser
   apagada: desative e apague depois.

> Quando o time crescer, mova as migrações do build para um GitHub Action (staging no merge, produção na release):
> fica mais fácil de auditar e de reverter. Runners do GitHub só têm IPv4: usem o *session pooler* (porta 5432).

**Staging de verdade**: os **Cron Jobs da Vercel só rodam em deploys de produção** (não em prévias de PR). Para o
staging exercitar a varredura das chamadas de voz, crie projetos `forja-web-staging`/`forja-admin-staging` cuja
"produção" é uma branch `staging`, apontando para outro projeto da Supabase. A *Password Protection* custa
US$ 20/mês por projeto; a *Vercel Authentication* (já ligada) é incluída no Pro.

## Custos (US$/mês, lançamento)

| Item | Valor |
|---|---|
| Supabase Pro (já pago) | US$ 25 (inclui US$ 10 de compute) |
| Projeto de produção (Micro) | US$ 10 (coberto pelo crédito se for o único) |
| Projeto de staging (Micro), quando criar | **+ US$ 10** |
| Vercel Pro | US$ 20 por assento que faz deploy (inclui US$ 20 de uso) |
| Total incremental estimado | **~US$ 20–40** além do que você já paga |

Quando houver clientes pagantes, suba a produção para **Small + PITR de 7 dias** (~US$ 115/mês) e mantenha um
`pg_dump` noturno fora da Supabase. Projetos gratuitos da Supabase pausam depois de 1 semana sem uso e não têm backup,
então não servem nem para staging.

## LGPD

Com banco e apps nos EUA, **todo** dado pessoal dos clientes sai do Brasil. Isso é transferência internacional (art. 33
da LGPD). Aceite os DPAs da Supabase e da Vercel, liste-as (e as APIs de IA) como suboperadoras na política de
privacidade e use as cláusulas-padrão da ANPD (Resolução CD/ANPD nº 19/2024) nos contratos. Valide com um advogado. Os
EUA não têm decisão de adequação; a UE tem (Resolução ANPD nº 32/2026). Alguns clientes corporativos exigem dados no
Brasil. Se isso virar requisito de venda, a migração é banco para `sa-east-1` e Vercel para `gru1`, juntos.
