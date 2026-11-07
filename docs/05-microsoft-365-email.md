# 5. E-mail transacional pelo Microsoft 365

Os e-mails automáticos (confirmação de cadastro, convite de equipe, link de acesso e recuperação de senha) saem da
caixa `nao-responda@<seu domínio>` do Microsoft 365 da empresa, pelo **Microsoft Graph** (`POST /users/{caixa}/sendMail`
com token de aplicativo). O passo a passo de configuração está pronto para o Cowork em
[`cowork/02-microsoft-365-email.md`](cowork/02-microsoft-365-email.md).

## Por que assim (verificado em 04/11/2026)

| Opção | Situação | Decisão |
|---|---|---|
| SMTP com senha (Basic) | Desligado por padrão a partir do fim de dezembro de 2026; remoção final anunciada para 2027 | Não usar |
| Conector SMTP relay / Direct Send | Não funciona a partir de hospedagem de terceiros (Vercel) | Não usar |
| **Graph `sendMail` com permissão de aplicativo** | Recomendado pela Microsoft para serviços; sucesso = `202 Accepted` | **Usar** |
| Restrição "Application Access Policies" | Sendo substituída | Não usar |
| **RBAC para Aplicativos do Exchange** | Mecanismo atual para limitar o app a uma caixa | **Usar** |

Pontos de atenção:
- **Não conceda `Mail.Send` no Entra ID.** As permissões do Entra e do Exchange se somam; a do Entra vale para o
  locatário inteiro e anula a restrição à caixa única.
- **Limites** (valem para a plataforma toda, porque tudo sai de uma caixa): 30 mensagens por minuto, 10.000
  destinatários por dia por caixa, 4 envios simultâneos no Graph. O código espera o `Retry-After` e tenta de novo
  uma vez. O limite diário de destinatários externos é do **locatário inteiro** (~500 × licenças^0,7 + 9.500) e é
  dividido com o e-mail normal da equipe.
- **Escala**: a Microsoft diz que o Exchange Online não é feito para envio em massa. Para o lançamento serve; se
  passar de alguns milhares de e-mails por dia, mova os transacionais para um provedor dedicado num subdomínio
  (ex.: `mail.seudominio.com.br`). O Azure Communication Services Email **não** é boa saída de longo prazo:
  a Microsoft anunciou a aposentadoria dele (efetiva em 2028).
- **Segredo do cliente** vale no máximo 24 meses (recomendado 12). Quando vence, o cadastro e a recuperação de senha
  param de funcionar sem aviso. Alternativa sem segredo, para depois: credencial federada com o OIDC da Vercel.
- `saveToSentItems: false` (booleano de verdade): links de acesso não ficam guardados na caixa.
- Em desenvolvimento, sem as variáveis `MS_*`, os e-mails aparecem no terminal.

## Variáveis

| Variável | Exemplo |
|---|---|
| `MS_TENANT_ID` | ID do diretório (locatário) |
| `MS_CLIENT_ID` | ID do aplicativo (cliente) do "Forja Mailer" |
| `MS_CLIENT_SECRET` | valor do segredo (Sensitive na Vercel) |
| `EMAIL_FROM` | `nao-responda@seudominio.com.br` |
