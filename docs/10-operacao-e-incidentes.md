# 10. Operação: alertas, backup e plano de incidente

O que a Forja confere sozinha todo dia, onde fica a cópia do banco e o que fazer quando um segredo vaza. Código em
`packages/ops`; telas **Alertas** e **Backup e chaves** no painel do dono.

## Rotina diária

O cron `/api/cron/diario` (forja-web, 09:23 UTC) roda a cobrança (doc 8) e a operação:

| Etapa | O que faz |
|---|---|
| Câmbio | Busca a PTAX de venda no Banco Central e aplica a folga escolhida em Câmbio e taxas (padrão 3%). Se a PTAX falhar, o câmbio anterior continua |
| Conciliação | Compara o custo que a Forja registrou com o relatório da Anthropic e da OpenAI de dois dias antes (os relatórios atrasam) |
| Alertas | Confere margem, chaves, provedores, câmbio e backup; abre um alerta por problema |
| E-mail | Manda um e-mail só, com os alertas novos, para todos da equipe (`platform_role = staff`) |

### Alertas

| Alerta | Quando abre | Fecha sozinho? |
|---|---|---|
| Margem negativa | Cliente que nos últimos 7 dias foi cobrado abaixo do custo efetivo (um por cliente por semana) | não |
| Chave falhando | 5 erros ou mais e 20% das chamadas da chave nas últimas 24 h | não |
| Provedor com erro | Mais de 2% das chamadas em 24 h, com pelo menos 50 chamadas | não |
| Câmbio desatualizado | Sem PTAX há mais de 3 dias | sim, quando a PTAX volta |
| Conciliação | Diferença acima de 2% e de US$ 1 contra o relatório do provedor | não |
| Backup | Não configurado, falhou ou parado há mais de 36 h | sim, com o próximo backup bom |

O mesmo problema nunca abre dois alertas. Resolvido no painel, se voltar, abre de novo. **Enviar alerta de teste**
confirma que o e-mail chega.

### Conciliação: o que configurar

Nos **Secrets do Supabase** (Edge Functions → Secrets), onde ficam as chaves da Forja:

- `ANTHROPIC_ADMIN_KEY`: Console da Anthropic → Settings → Admin keys (começa com `sk-ant-admin`).
- `ANTHROPIC_WORKSPACE_ID`: o workspace usado só pela Forja. Sem ele, o relatório soma a organização inteira.
- `OPENAI_ADMIN_KEY`: platform.openai.com → Settings → Admin keys.
- `OPENAI_PROJECT_ID`: o projeto usado só pela Forja (`proj_...`).

Se as mesmas chaves de API servem a outros sistemas, a conciliação nunca bate. Use um workspace ou projeto só da Forja.

**Risco conhecido**: chave de admin manda na organização do provedor: cria chaves, convida pessoas. Ela chega aos dois
apps pela função `forja-chaves`, como as outras. Quem invadir o forja-web teria acesso a ela, mas também já teria a
chave secreta do Supabase.
- Se não quiser esse risco agora, deixe as chaves de admin de fora: a conciliação aparece como "sem relatório", e o
  resto funciona.
- Melhoria planejada: uma credencial só do painel para os segredos de admin.

## Backup diário fora do Supabase

O workflow **Backup diário** (`.github/workflows/backup.yml`) roda todo dia às 03:47 de Brasília:

1. `pg_dump` dos schemas `public` e `drizzle` (Postgres 17, o mesmo do Supabase).
   - Sessões de login e códigos de verificação ficam de fora: uma cópia vazada não deve permitir entrar na conta de
     ninguém.
   - Depois de uma restauração, todos entram de novo.
2. **Restauração de teste** num Postgres separado, criado só para isso. O backup é reprovado se:
   - as tabelas restauradas não forem as mesmas da origem;
   - alguma tabela tiver quantidade de linhas diferente da origem (tolerância de 20 linhas ou 2%, porque o banco segue
     recebendo dados durante a cópia);
   - faltar uma das tabelas principais;
   - o histórico de migrações estiver vazio.
3. Cópia cifrada com **age** para a chave pública do dono, guardada por 30 dias nos artefatos da execução.
4. O resultado vai para a Forja (`settings.backup_meta`) e aparece em **Backup e chaves**. Se falhar, o alerta abre.

**Por que cifrado**: o repositório `j0Cs/j0Cs` é **público**. Artefatos e logs de repositório público podem ser vistos
por qualquer pessoa logada no GitHub. Por isso a cópia sai cifrada (só a chave privada do dono abre) e o log não mostra
dados nem contagens. Tornar o repositório privado é recomendado.

O backup entra no banco com um papel próprio, `forja_backup`:
- lê as tabelas da Forja;
- para gravar o resultado, só pode chamar a função `forja_interno.registrar_backup`; não escreve em nenhuma tabela, nem
  no câmbio, que fica na mesma tabela `settings`;
- não enxerga os schemas do Supabase (auth, storage);
- a URL exige conexão cifrada (`sslmode=require`).

O log da execução, que é público, mostra só os passos e, se algo falhar, a linha do erro. Os detalhes do Postgres, que
podem trazer valores das linhas, ficam de fora.

### Configurar (uma vez, uns 5 minutos)

Siga `docs/cowork/04-backup.md` (prompt pronto para o Cowork) ou faça à mão:

1. Painel → **Backup e chaves** → **Gerar par de chaves do backup**. Guarde a **chave privada** no seu gerenciador de
   senhas, e numa segunda cópia fora do computador. Ela aparece uma vez só e não fica guardada em lugar nenhum.
2. No mesmo cartão, **Gerar o acesso do backup ao banco**: aparece a URL do papel `forja_backup`, uma vez só.
3. GitHub → `j0Cs/j0Cs` → Settings → Secrets and variables → Actions:
   - aba **Variables** → `BACKUP_AGE_RECIPIENT` = a chave pública (`age1...`);
   - aba **Secrets** → `BACKUP_DATABASE_URL` = a URL do passo 2.
4. Actions → **Backup diário** → *Run workflow*. Em uns 3 minutos o cartão no painel mostra "em dia".

O GitHub só agenda (e só mostra *Run workflow* para) workflows que estão na branch padrão. Por isso o backup diário
começa quando o PR da Forja entrar na `main`. Até lá, o alerta "Backup diário ainda não configurado" fica aberto.

### Restaurar (desastre ou teste mensal)

1. GitHub → Actions → Backup diário → a execução do dia → *Artifacts* → baixe `forja-backup-...` e descompacte.
2. Salve a chave privada num arquivo, por exemplo `chave.txt`, com permissão só sua.
3. Crie um banco vazio: um projeto novo no Supabase ou um Postgres local.
4. Rode, numa máquina com `age` e Postgres 17 (`brew install age postgresql@17` ou `apt install age postgresql-client-17`):

   ```bash
   bash ops/backup/restaurar.sh forja-AAAA-MM-DD.dump.age chave.txt "postgresql://usuario:senha@host:5432/postgres"
   ```

   O script confere o `.sha256`, recusa um banco que já tenha tabelas e restaura sem mexer em donos ou permissões.
5. Para pôr no ar: aponte `DATABASE_URL` (e as `POSTGRES_*`) dos dois projetos da Vercel para o banco novo e faça
   Redeploy. As chaves de API e os tokens continuam abrindo, porque a `ENCRYPTION_KEY` é a mesma.
6. Apague o `chave.txt`.

**Teste feito na Sprint 4**: backup do banco local, restauração do arquivo cifrado num banco separado e comparação do
conteúdo das 27 tabelas linha por linha: idêntico. Na versão final, as sessões ficam de fora: 59 sessões na origem, 0 na
restauração, usuários e organizações intactos. Também conferido:
- a chave errada não abre o arquivo;
- restaurar por cima de um banco com dados é recusado;
- o papel `forja_backup` faz o `pg_dump` completo e não consegue alterar outras tabelas.

Em produção, a restauração de teste roda todo dia dentro do workflow.

## Chave de criptografia (ENCRYPTION_KEY)

A chave cifra (AES-256-GCM) as chaves de API do painel e do BYOK, os tokens dos conectores e as senhas dos bancos
criados no Supabase dos clientes. As chaves são numeradas:
- `ENCRYPTION_KEY` é a chave 1;
- `ENCRYPTION_KEY_2`, `ENCRYPTION_KEY_3`… são as seguintes.

A Forja cifra com a de maior número e decifra pela chave marcada em cada valor. Assim a troca **não precisa ler a
antiga**, que na Vercel é "sensitive" e não pode ser lida de volta.

**Trocar (cerca de 10 minutos):**

1. Painel → **Backup e chaves** → **Gerar a próxima chave**. Aparece o nome (ex.: `ENCRYPTION_KEY_2`) e o valor, uma vez só.
2. Na Vercel, crie essa variável (Sensitive, Production) com esse valor nos **dois** projetos, forja-web e forja-admin. Faça
   Redeploy dos dois.
3. Volte ao painel: a chave ativa passa a ser a nova. Clique em **Recifrar com a chave ativa**.
   - Ele recifra tudo e confere cada valor antes de gravar.
   - O que não abrir fica como estava e é listado.
4. Quando a tabela mostrar tudo na chave nova, apague a variável antiga nos dois projetos e faça Redeploy.

## Trocar os segredos que passaram pela conversa (fim da Sprint 4)

Os segredos de produção criados durante o desenvolvimento passaram pela conversa com o Claude. Troque cada um por um
valor que só você viu. Os valores são gerados no painel, no seu navegador, e você cola direto na Vercel. Leva uns 20 minutos.

1. **Senha do painel**:
   - Painel → Backup e chaves → **Senha do painel**: troque.
   - Depois apague `ADMIN_PASSWORD` no forja-admin (Vercel). Ela só serve para criar a conta na primeira vez.
2. **ENCRYPTION_KEY**: siga a rotação acima (`ENCRYPTION_KEY_2` + Recifrar), depois apague a `ENCRYPTION_KEY` antiga.
3. **BETTER_AUTH_SECRET**: faça em cada projeto, com um valor diferente em cada um.
   - Painel → Backup e chaves → **Gerar um segredo aleatório**.
   - Na Vercel, crie `BETTER_AUTH_SECRETS` (Sensitive, Production) com o valor `2:<segredo gerado>`.
   - **Mantenha** o `BETTER_AUTH_SECRET`: ele só passa a abrir o 2FA já cadastrado. Logins e links novos usam o segredo
     novo.
   - Todos entram de novo uma vez.
4. **CRON_SECRET** (forja-web): gere outro segredo e substitua o valor.
5. Faça **Redeploy** dos dois projetos.
6. Confira:
   - consegue entrar no painel com o 2FA;
   - o app abre;
   - em Alertas, **Verificar agora** funciona;
   - no dia seguinte, a rotina diária rodou (câmbio atualizado em Câmbio e taxas).

## Plano de incidente: segredo vazado

Meta: **segredo vazado trocado em até 15 minutos**. Primeiro corte o acesso (revogue no serviço de origem), depois
atualize onde a Forja lê e só então investigue.

| Segredo | Onde a Forja lê | Como trocar | Tempo | Efeito |
|---|---|---|---|---|
| Chave de um provedor (`CLAUDE_KEY`, `OPENAI_KEY`, `GEMINI_API`, `GROK_API`) | Secrets do Supabase | Revogue no console do provedor, gere outra e atualize o Secret no Supabase | 3 min | A Forja usa a nova em até 2 min, sem deploy. Para estancar antes, desligue os modelos do provedor em Modelos e preços |
| Chave cadastrada no painel ou BYOK do cliente | Banco (cifrada) | Revogue no provedor; em Chaves de API, desative e cadastre a nova | 3 min | Imediato |
| Chave de admin (`ANTHROPIC_ADMIN_KEY`, `OPENAI_ADMIN_KEY`) | Secrets do Supabase | Revogue e gere outra no console; atualize o Secret | 3 min | Só a conciliação |
| GitHub App (`GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET`) | Secrets do Supabase | github.com/settings/apps → Forja Agentes: gere uma chave nova, apague a vazada; gere um client secret novo, apague o vazado; atualize os Secrets | 5 min | Tokens de instalação antigos vencem em até 1 h |
| `ENCRYPTION_KEY` | Vercel (os dois projetos) | Rotação acima, e troque também os segredos que ela protege (chaves de API, tokens) | 15 min | Sem queda |
| `BETTER_AUTH_SECRET` (web ou admin) | Vercel | Crie `BETTER_AUTH_SECRETS` = `2:<valor novo>` no projeto afetado, sem apagar o `BETTER_AUTH_SECRET` (ele ainda abre o 2FA já cadastrado), e faça Redeploy | 5 min | Todos entram de novo. No painel, a equipe recadastra o 2FA e então apaga o `BETTER_AUTH_SECRET` antigo |
| `CRON_SECRET` | Vercel (forja-web) | Gere outro e substitua; Redeploy | 3 min | Nenhum |
| Stripe (`STRIPE_SECRET_KEY`) | Vercel (os dois) | Stripe → Developers → API keys → *Roll key* (expirar a antiga já); atualize e faça Redeploy | 5 min | Pagamentos param por 1 a 2 min |
| Stripe webhook (`STRIPE_WEBHOOK_SECRET`) | Vercel (forja-web) | Stripe → Webhooks → o endpoint → *Roll secret*; atualize e faça Redeploy | 5 min | O Stripe reenvia o que falhar |
| Chave secreta do Supabase (`SUPABASE_SECRET_KEY`, service role) | Vercel (integração) | Supabase → Settings → API Keys → crie uma secret key nova e apague a vazada; confira se a integração atualizou a Vercel (senão, cole) e faça Redeploy | 5 min | A função `forja-chaves` aceita qualquer secret key do projeto |
| Senha do banco | Vercel (`POSTGRES_*`, `DATABASE_URL`) | Supabase → Database → Settings → *Reset database password*; atualize as variáveis e faça Redeploy | 10 min | Queda de 1 a 2 min |
| Acesso do backup (`BACKUP_DATABASE_URL`) | GitHub | Painel → Backup e chaves → Gerar o acesso do backup ao banco (a senha antiga para na hora); atualize o secret no GitHub | 2 min | Nenhum |
| Chave privada do backup | Com você | Gere um par novo e troque `BACKUP_AGE_RECIPIENT` no GitHub. Os backups antigos continuam cifrados para a chave vazada: apague os artefatos antigos em Actions | 5 min | Nenhum |
| Microsoft 365 (`MS_CLIENT_SECRET`) | Vercel | Entra ID → App registrations → o app → Certificates & secrets: crie outro e apague o vazado; atualize e faça Redeploy | 5 min | E-mails param por 1 a 2 min |
| Token de conector de um cliente (Vercel, Supabase) | Banco (cifrado) | O cliente revoga no serviço e remove em Conectores | 2 min | Imediato |

Depois do incidente:
- **Registre** o que vazou, quando, por onde e o que foi trocado, numa nota com data.
- **Procure uso indevido**:
  - painel de uso do provedor;
  - logs da Vercel;
  - Alertas, em especial conciliação e chave falhando;
  - extrato de créditos dos clientes.
- **Se houver dado de cliente exposto**, avalie a comunicação aos titulares e à ANPD (LGPD, art. 48), em prazo razoável.

Prevenção:
- Nenhum segredo vai para o repositório (ele é público).
- Cada segredo vive num lugar só: provedores e GitHub App nos Secrets do Supabase; o resto como Sensitive na Vercel.
- O GitHub avisa se um segredo for commitado (*secret scanning*, ligado em repositórios públicos).
