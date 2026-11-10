# Prompt para o Cowork: backup diário da Forja

> Copie tudo abaixo da linha e envie para o Cowork. Ele trabalha no seu navegador, já logado no painel da Forja e no
> GitHub. Leva uns 5 minutos. Você precisa estar por perto no passo 1, para guardar a chave privada.

---

Você vai ligar o backup diário da minha plataforma Forja. Trabalhe no meu navegador. **Nunca escreva na conversa o
valor de uma chave privada, de uma senha ou de uma URL de banco**: copie direto de onde aparece para onde indico. No fim,
me diga só o que foi feito e o resultado da primeira execução.

**1. Chaves do backup (no painel do dono)**
- Abra `https://forja-admin-rampin-tech.vercel.app/operacao` (entre com a minha conta e o código do 2FA se pedir).
- No cartão **Backup diário**, clique em **Gerar par de chaves do backup** e confirme.
- **Pare e me chame**: a chave privada (`AGE-SECRET-KEY-...`) aparece só agora. Eu mesmo copio e guardo no meu
  gerenciador de senhas. Espere eu dizer "guardei" para continuar.
- Copie a **chave pública** (`age1...`) para usar no passo 2.

**2. Variável no GitHub**
- Abra `https://github.com/j0Cs/j0Cs/settings/variables/actions` → **New repository variable**.
- Name: `BACKUP_AGE_RECIPIENT`. Value: a chave pública do passo 1. Salve.

**3. Acesso ao banco**
- Volte ao painel (`/operacao`) e clique em **Gerar o acesso do backup ao banco** e confirme.
- Copie a URL que aparece (começa com `postgresql://forja_backup.`).
- Abra `https://github.com/j0Cs/j0Cs/settings/secrets/actions` → **New repository secret**.
- Name: `BACKUP_DATABASE_URL`. Secret: a URL copiada. Salve.

**4. Primeira execução**
- Abra `https://github.com/j0Cs/j0Cs/actions/workflows/backup.yml` → **Run workflow** → branch padrão → **Run workflow**.
  - O GitHub só mostra (e só agenda) workflows que estão na branch padrão. Se aparecer "workflow not found", o PR da
    Forja ainda não entrou na `main`: pare aqui e me avise. Os passos 1 a 3 já ficam valendo.
- Espere terminar (uns 3 minutos). Deve ficar verde, com o passo "Backup e restauração de teste" mostrando "restauração
  aprovada".
- Recarregue `/operacao` no painel: o cartão **Backup diário** deve mostrar **em dia**.

Se algum passo falhar, me diga a mensagem de erro exatamente como aparece (o log do GitHub não mostra dados nem senhas).
Não altere nada na Vercel nem no Supabase.
