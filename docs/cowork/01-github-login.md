# Prompt para o Cowork: login com GitHub

> Copie tudo abaixo da linha e envie para o Cowork. Ele vai trabalhar no seu navegador, já logado no GitHub.
> Antes, preencha os dois endereços entre `< >` se já existirem (senão o Cowork cria só o app de desenvolvimento).

---

Você vai configurar o "Entrar com GitHub" da minha plataforma Forja (o login usa a biblioteca Better Auth).
Trabalhe no meu navegador, na minha conta do GitHub. **Nunca escreva o valor de um Client Secret na conversa**:
cole direto onde indico e, no fim, me diga apenas o que foi feito e os Client IDs.

**Endereços**
- Desenvolvimento: `http://localhost:3000`
- Staging: `<https://staging.seudominio.com.br>` (se estiver vazio, pule o app de staging)
- Produção: `<https://app.seudominio.com.br>` (se estiver vazio, pule o app de produção)

**Passo a passo (repita para cada endereço preenchido)**
1. Abra https://github.com/settings/developers → **OAuth Apps** → **New OAuth App** (ou "Register a new application").
2. Preencha:
   - Application name: `Forja Dev`, `Forja Staging` ou `Forja` (produção)
   - Homepage URL: o endereço do ambiente
   - Application description: `Plataforma Forja — entrar com GitHub`
   - Authorization callback URL: `<endereço>/api/auth/callback/github`
     (ex.: `http://localhost:3000/api/auth/callback/github`). Cadastre **só essa** URL.
   - Deixe **Enable Device Flow** desmarcado e deixe **Expire user access tokens** marcado.
3. Clique em **Register application**. Confirme que a correspondência por curinga (wildcard) da URL de callback está **desligada**.
4. Copie o **Client ID**. Clique em **Generate a new client secret** e copie o segredo imediatamente (ele aparece uma vez só).
5. Guarde os dois valores:
   - App **Dev**: no arquivo `.env` da raiz do repositório Forja no meu computador (se você tiver acesso a ele),
     nas linhas `GITHUB_CLIENT_ID=` e `GITHUB_CLIENT_SECRET=`. Se não tiver acesso, salve no meu gerenciador de senhas
     num item chamado `Forja — GitHub OAuth (dev)`.
   - Apps **Staging/Produção**: na Vercel, time **Rampin Technology**, projeto **forja-web** → Settings → Environment Variables:
     `GITHUB_CLIENT_ID` (tipo Config) e `GITHUB_CLIENT_SECRET` (tipo **Secret**), no ambiente certo
     (Preview para staging, Production para produção). Se o projeto ainda não existir, salve no gerenciador de senhas
     como `Forja — GitHub OAuth (staging|prod)`.
6. Não crie nada com o domínio `*.vercel.app` e não registre o app de login no painel do dono (ele não usa GitHub).

**Opcional (reserva de nome para a Sprint 3)**
Em https://github.com/settings/apps → **New GitHub App**: nome `Forja Agentes` (até 34 caracteres; se estiver ocupado,
tente `Forja Agents`), Homepage `https://seudominio.com.br`, **sem nenhuma permissão**, webhook **desmarcado (Active off)**,
"Where can this GitHub App be installed?": **Any account**. Só crie, não instale e não gere chave privada.

**No fim, me responda com**
- os apps criados e seus **Client IDs** (nunca os secrets);
- onde cada secret foi guardado;
- qualquer passo que não conseguiu fazer e por quê.
