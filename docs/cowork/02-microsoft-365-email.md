# Prompt para o Cowork: e-mail da plataforma pelo Microsoft 365

> Copie tudo abaixo da linha e envie para o Cowork. Ele precisa de uma conta **administradora** do Microsoft 365
> e de um terminal PowerShell (no Windows, ou o **Azure Cloud Shell** em https://shell.azure.com se não houver PowerShell).
> Troque `seudominio.com.br` pelo domínio real da empresa antes de enviar.

---

Você vai configurar o envio de e-mails automáticos da minha plataforma Forja (confirmação de cadastro, convite de
equipe, link de acesso e recuperação de senha) pelo nosso Microsoft 365, usando o Microsoft Graph com uma permissão
**restrita a uma única caixa**. **Nunca escreva o valor do client secret na conversa**: cole direto onde indico.

**1. Criar a caixa remetente (sem licença)**
- admin.microsoft.com → **Equipes e grupos → Caixas de correio compartilhadas → + Adicionar**.
- Nome: `Forja - Não responda`. Endereço: `nao-responda@seudominio.com.br` (use o domínio próprio, **nunca** `@*.onmicrosoft.com`).

**2. Registrar o aplicativo**
- entra.microsoft.com → **Entra ID → Registros de aplicativo → Novo registro**.
- Nome: `Forja Mailer`. Tipo de conta: **somente este diretório organizacional**. Sem URI de redirecionamento → **Registrar**.
- Anote o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.

**3. Permissões (crítico)**
- No app → **Permissões de API**: remova a permissão delegada padrão `User.Read`.
- **NÃO** adicione `Mail.Send` do Microsoft Graph e **não** conceda consentimento de administrador para ela.
  (Se essa permissão existir no locatário, ela libera o envio como **qualquer** caixa e anula a restrição do passo 5.
  Se já tiver sido concedida: Entra ID → Aplicativos empresariais → Forja Mailer → Permissões → revogar.)

**4. Credencial**
- No app → **Certificados e segredos → Novo segredo do cliente**: descrição `forja-producao`, validade **12 meses**.
- Copie o **Valor** na hora (aparece uma vez) e guarde direto onde indico no passo 7.
- Crie um lembrete na minha agenda para **30 dias antes do vencimento**: "Renovar segredo do Forja Mailer".

**5. Restringir o app a uma única caixa (RBAC para Aplicativos do Exchange)**
- Pegue os IDs certos em **Entra ID → Aplicativos empresariais → Forja Mailer → Visão geral**:
  o **ID do aplicativo** e o **ID do objeto** desta tela (não o da tela de Registros de aplicativo).
- No PowerShell (ou Azure Cloud Shell):
  ```powershell
  Install-Module ExchangeOnlineManagement -Scope CurrentUser   # se ainda não tiver
  Connect-ExchangeOnline -UserPrincipalName <admin@seudominio.com.br>

  New-ServicePrincipal -AppId <ID_DO_APLICATIVO> -ObjectId <ID_DO_OBJETO_DO_APLICATIVO_EMPRESARIAL> -DisplayName "Forja Mailer"
  New-ManagementScope -Name "Forja - caixa nao-responda" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'nao-responda@seudominio.com.br'"
  New-ManagementRoleAssignment -App <ID_DO_APLICATIVO> -Role "Application Mail.Send" -CustomResourceScope "Forja - caixa nao-responda"
  ```
- Teste (pode levar de 30 minutos a 2 horas para valer):
  ```powershell
  Test-ServicePrincipalAuthorization -Identity <ID_DO_APLICATIVO> -Resource nao-responda@seudominio.com.br | Format-Table
  Test-ServicePrincipalAuthorization -Identity <ID_DO_APLICATIVO> -Resource <outra.caixa@seudominio.com.br> | Format-Table
  ```
  O primeiro deve mostrar `Application Mail.Send` com **InScope = True**; o segundo, **InScope = False**.

**6. Entregabilidade (DNS)**
- **SPF**: confirme que o domínio tem um único registro TXT `v=spf1 include:spf.protection.outlook.com -all`
  (se já houver outro SPF, junte os dois num só).
- **DKIM**: security.microsoft.com → **Email e colaboração → Políticas e regras → Políticas de ameaças →
  Configurações de autenticação de email → DKIM** → selecione o domínio, publique os dois CNAMEs que o portal mostrar
  no provedor de DNS e ative a assinatura.
- **DMARC**: TXT em `_dmarc.seudominio.com.br` com `v=DMARC1; p=none; rua=mailto:dmarc@seudominio.com.br` (vamos
  endurecer para `quarantine` depois de algumas semanas de relatórios).

**7. Guardar os valores**
- Na Vercel, time **Rampin Technology**, projetos **forja-web** e **forja-admin** → Settings → Environment Variables,
  em Production e Preview (`MS_CLIENT_SECRET` como tipo **Secret**; os demais podem ser Config):
  `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EMAIL_FROM=nao-responda@seudominio.com.br`.
- Se os projetos ainda não existirem, salve no gerenciador de senhas como `Forja — Microsoft 365 Mailer`.

**No fim, me responda com**
- tenant ID, client ID, endereço da caixa e data de vencimento do segredo (nunca o valor do segredo);
- o resultado dos dois `Test-ServicePrincipalAuthorization`;
- o estado de SPF, DKIM e DMARC;
- qualquer passo que não conseguiu fazer e por quê.
