# 6. Infraestrutura: Supabase + Vercel

**Recomendação: sim, Supabase para o banco e Vercel para os apps**, com três condições: os dois em **São Paulo**,
a **Data API da Supabase desligada** (nós não usamos `supabase-js`) e **Vercel no plano Pro** (o Hobby proíbe uso
comercial). Você já usa os dois no dia a dia (Supabase Pro e o time Rampin Technology na Vercel), o que reduz atrito.

## Arquitetura

```
Navegador ──► Vercel gru1 (São Paulo) ──► Supabase sa-east-1 (São Paulo)
               ├─ forja-web   (apps/web)      pooler modo transação :6543 (runtime)
               └─ forja-admin (apps/admin)    pooler modo sessão   :5432 (migrações)
```

- Vercel `gru1` roda na mesma região AWS (`sa-east-1`) da Supabase: ~1–3 ms entre app e banco, contra ~110–130 ms
  se ficar no padrão `iad1` (EUA). Os `vercel.json` dos apps já fixam `gru1`.
- O pool de conexões usa `attachDatabasePool` (Fluid compute) e consultas sem prepared statements nomeados
  (exigência do pooler em modo transação).
- **RLS ligado em todas as tabelas** (migração `0002_rls`; o script de migração falha se alguma ficar sem) **e** Data
  API desligada: defesa em duas camadas. O app conecta como `postgres` (dono das tabelas), que ignora o RLS.

## Passo a passo (staging; produção é igual, com outro projeto)

1. **Supabase** → organização `j0Cs's` (Pro) → New project: nome `forja-staging`, região **South America (São Paulo)**
   (escolha a região específica, não "Americas", que cai nos EUA), senha forte do banco (guarde no gerenciador de senhas).
   Em **Data API**, desligue *Enable Data API*. Em **Database Settings → SSL**, ligue *Enforce SSL*.
2. Em **Connect**, copie:
   - *Transaction pooler* (porta 6543) → `DATABASE_URL`
   - *Session pooler* (porta 5432) → `DATABASE_URL_DIRECT`
   - em Database Settings → SSL, baixe o certificado → `DATABASE_SSL_CA` (conteúdo, numa linha com `\n`).
3. **Vercel** (time Rampin Technology, plano Pro) → Add New Project → importe `j0Cs/j0Cs` duas vezes:
   - `forja-web`, Root Directory `apps/web`
   - `forja-admin`, Root Directory `apps/admin`
4. Variáveis de ambiente (Preview = staging; Production = produção). Segredos com o tipo **Secret** (o antigo
   "Sensitive"); o resto pode ser **Config**:

| Variável | web | admin | Observação |
|---|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_DIRECT`, `DATABASE_SSL_CA` | ✔ | ✔ | do passo 2 |
| `DATABASE_POOL_MAX` | 5 | 5 | |
| `ENCRYPTION_KEY` | ✔ | ✔ | **o mesmo valor** nos dois (`pnpm gen:key`) |
| `BETTER_AUTH_SECRET` | ✔ | ✔ | pode ser o mesmo ou diferente |
| `WEB_URL` / `ADMIN_URL` | ✔ | ✔ | URLs públicas de cada app |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | ✔ | conta inicial do painel (troque a senha depois) |
| `ADMIN_IP_ALLOWLIST` | | opcional | |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EMAIL_FROM` | ✔ | ✔ | ver doc 5 |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | ✔ | | ver `cowork/01-github-login.md` |
| `CRON_SECRET` | ✔ | | varredura das chamadas de voz (a Vercel envia no cabeçalho) |
| `ANTHROPIC_API_KEY` etc. | | | **não**: chaves dos provedores são cadastradas no painel (criptografadas no banco) |

5. **Deploy**: cada build roda as migrações pendentes (com trava no banco, então os dois apps podem buildar juntos);
   o build do painel também roda o seed (planos, catálogo de modelos e a conta do dono). O seed **não** cria a conta
   demo em produção.
6. Primeiro acesso ao painel: entre com `ADMIN_EMAIL`/`ADMIN_PASSWORD`, ative o 2FA, cadastre as chaves dos
   provedores em **Chaves de API** e atualize o câmbio.

> Quando o time crescer, mova as migrações do build para um GitHub Action (staging no merge, produção na release):
> fica mais fácil de auditar e de reverter. Runners do GitHub só têm IPv4: usem o *session pooler* (porta 5432).

**Staging de verdade**: os **Cron Jobs da Vercel só rodam em deploys de produção** (não em prévias de PR). Para o
staging exercitar a varredura das chamadas de voz, crie projetos `forja-web-staging`/`forja-admin-staging` cuja
"produção" é a branch de staging, apontando para o banco `forja-staging`. Proteja o staging com a *Vercel
Authentication* (incluída no Pro); a *Password Protection* custa US$ 20/mês por projeto.

## Custos (US$/mês, lançamento)

| Item | Valor |
|---|---|
| Supabase Pro (já pago) | US$ 25 (inclui US$ 10 de compute) |
| Projeto de produção (Micro) | US$ 10 (coberto pelo crédito se for o único) |
| Projeto de staging (Micro) | **+ US$ 10** |
| Vercel Pro | US$ 20 por assento que faz deploy (inclui US$ 20 de uso) |
| Total incremental estimado | **~US$ 20–40** além do que você já paga |

Observações: o compute da Vercel em `gru1` custa ~73% mais que nos EUA (vale pela latência); quando houver clientes
pagantes, suba a produção para **Small + PITR de 7 dias** (~US$ 115/mês) e mantenha um `pg_dump` noturno fora da
Supabase. Os projetos gratuitos da Supabase pausam após 1 semana sem uso e não têm backup, então não servem nem para staging.

## LGPD

Região São Paulo ajuda, mas não basta: suporte e telemetria da Supabase e da Vercel, e as APIs de IA, processam dados
fora do Brasil. Liste todos como suboperadores na política de privacidade, aceite os DPAs e valide com advogado as
cláusulas-padrão da ANPD (Resolução CD/ANPD nº 19/2024). A UE passou a ser considerada adequada (Resolução ANPD
nº 32/2026), mas transferências para os EUA e Singapura continuam precisando das cláusulas.
