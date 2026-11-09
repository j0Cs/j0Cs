# Prompt para o Cowork: GitHub App "Forja Agentes"

> Copie tudo abaixo da linha e envie para o Cowork. Ele vai trabalhar no seu navegador, já logado no GitHub e no
> Supabase. É o app que o agente da Forja usa para ler o repositório do cliente e abrir pull requests.

---

Você vai configurar o GitHub App **Forja Agentes** da minha plataforma Forja. Trabalhe no meu navegador, na minha conta
do GitHub e no meu Supabase. **Nunca escreva o valor de um segredo (Client Secret ou chave privada) na conversa**: cole
direto onde indico e, no fim, me diga só o que foi feito, o App ID, o nome curto (slug) e o Client ID.

**Endereço do app do cliente**: `https://forja-web-rampin-tech.vercel.app` (troque pelo domínio próprio quando existir).

**1. Criar (ou editar) o app**
- Abra https://github.com/settings/apps. Se `Forja Agentes` já existir (nome reservado antes), clique em **Edit**; senão,
  **New GitHub App**.
- **GitHub App name**: `Forja Agentes` (se estiver ocupado, `Forja Agents`).
- **Homepage URL**: o endereço do app do cliente.
- **Callback URL**: `<endereço>/api/github/instalado`. Cadastre só essa.
- Marque **Request user authorization (OAuth) during installation**. É obrigatório: é assim que a Forja confirma que
  quem instalou tem acesso de verdade àquela conta.
- **Expire user authorization tokens**: marcado.
- **Setup URL**: deixe em branco (com a opção acima, o GitHub volta pela Callback URL).
- **Webhook**: desmarque **Active** (a Forja não usa webhook nesta versão).
- **Permissions → Repository permissions**:
  - **Contents**: Read and write (ler o código e criar a branch do PR)
  - **Pull requests**: Read and write (abrir o PR)
  - **Metadata**: Read-only (obrigatória)
  - Todo o resto: **No access**. Nada em Organization ou Account permissions.
- **Where can this GitHub App be installed?**: **Any account** (os clientes instalam nas contas deles).
- Salve (**Create GitHub App** ou **Save changes**).

**2. Credenciais**
- Na página do app, anote o **App ID**, o **Client ID** e o nome curto da URL pública
  (`https://github.com/apps/<slug>`).
- **Client secrets → Generate a new client secret**: copie o valor (aparece uma vez só).
- **Private keys → Generate a private key**: o navegador baixa um arquivo `.pem`.

**3. Guardar nos Secrets do Supabase** (onde ficam todas as chaves da Forja)
- Supabase → projeto **projeto_27** → **Edge Functions → Secrets** → adicione:
  - `GITHUB_APP_ID`: o App ID
  - `GITHUB_APP_SLUG`: o nome curto (ex.: `forja-agentes`)
  - `GITHUB_APP_CLIENT_ID`: o Client ID
  - `GITHUB_APP_CLIENT_SECRET`: o Client Secret
  - `GITHUB_APP_PRIVATE_KEY`: o conteúdo inteiro do arquivo `.pem`, de `-----BEGIN` até `-----END ... KEY-----`
- Depois de salvar, **apague o arquivo `.pem` baixado** do computador.

**4. Teste**
- Abra `<endereço>/agente`, clique em **Conectar o GitHub**, instale o app na minha conta e escolha um repositório de
  teste. A volta deve mostrar "GitHub conectado".
- Crie uma tarefa: "Adicione uma página de contato com formulário". Ela deve terminar esperando aprovação, com o diff
  na tela. Aprove e confirme que o PR apareceu no GitHub.

Não altere nada na Vercel nem no código: a Forja lê esses segredos sozinha (em até 2 minutos).
