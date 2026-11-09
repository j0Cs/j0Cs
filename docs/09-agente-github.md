# 9. Agente v1 com GitHub

O cliente pede uma mudança em português e recebe um pull request pronto para revisar. Código em `packages/agent`;
telas em `/agente`.

## Como funciona

1. **Conectar o GitHub** (dono ou admin, uma vez por organização).
   - A pessoa instala o GitHub App **Forja Agentes** e escolhe os repositórios liberados.
   - Na volta, a Forja troca o código OAuth da instalação e confere que a **própria pessoa** enxerga aquela instalação
     no GitHub. Sem isso, alguém poderia ligar a instalação de outra empresa trocando o número na URL.
   - O estado assinado (HMAC, 30 min) amarra a volta à mesma pessoa e organização.
   - Nenhum token fica guardado: a cada uso o app pede um token de instalação de 1 hora.
2. **Nova tarefa**: repositório, pedido, modelo (Claude, GPT ou Grok) e **teto de gasto** (padrão R$ 20).
   - A tarefa começa no commit atual da branch padrão.
   - Repositório vazio também serve: no PR, a Forja cria antes um README de partida.
3. **Execução**:
   - O agente baixa o repositório (tarball de até 50 MB) e trabalha numa **cópia**.
   - Ferramentas: listar arquivos, ler, buscar, escrever, editar (trecho único) e apagar.
   - Cada passo é uma rodada do modelo com ferramentas, **medida e cobrada** como qualquer resposta (`usage_events.agent_task_id`).
   - A tela mostra o plano, os passos ao vivo e o custo contra o teto.
4. **Aprovação**: a pessoa revisa o diff e clica em **Aprovar e abrir o PR**.
   - Só aí a Forja cria a branch `forja/...` com um commit das mudanças e abre o PR.
   - A descrição do PR traz o resumo do agente, o pedido e o custo.
   - **Descartar** não escreve nada no GitHub.
5. **"Gerar projeto" na call** leva à nova tarefa com a especificação já no pedido.
6. **"Enviar ao agente" no chat**: o botão no topo da conversa leva à nova tarefa.
   - O pedido traz as últimas mensagens, até 14 mil caracteres.
   - O repositório do projeto já vem escolhido.
   - A conversa recebe três avisos: o link da tarefa, o do PR e o do preview.

## Entrega: preview na Vercel e banco no Supabase (Sprint 4)

Depois do PR, a tarefa mostra o cartão de entrega. As credenciais são as do cliente, em **Conectores**.

**Vercel** (token da conta ou do time):
- Ao aprovar, se a Vercel está conectada, o preview sai sozinho:
  - a Forja acha o projeto ligado ao repositório ou cria um, com o framework lido do `package.json`;
  - depois cria o deployment de preview da branch do PR (nunca o de produção).
- A tela acompanha o build. Quando termina, a conversa recebe o link do preview junto com o do PR, uma vez só.
- Se o build falha, o motivo e o link do log ficam na tarefa e na conversa. **Publicar de novo** tenta outra vez, no
  mesmo projeto.
- Para criar o projeto, a Vercel precisa enxergar o repositório: na conta do cliente, Settings → Git, com o app do
  GitHub liberado para ele. Sem isso, a tarefa diz exatamente o que fazer.
- O preview fica atrás da proteção padrão da Vercel (login no time do cliente).

**Supabase** (token de acesso da Management API):
- Quando o agente escreve migrações em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql` (o prompt do agente pede esse
  padrão), o cartão lista os arquivos.
- O dono ou um administrador escolhe um projeto, ou cria um em São Paulo, marca a confirmação e aplica.
  - Cada migração roda inteira ou não roda (transação).
  - Para na primeira que falhar e mostra o erro do banco.
  - Fica gravada em `supabase_migrations.schema_migrations`, o mesmo histórico do Supabase CLI. Aplicar de novo não
    repete nada.
- Projeto criado pela Forja: a senha do banco é gerada aqui e guardada só criptografada no conector.
- Projeto ainda iniciando: a Forja pede para esperar 1 ou 2 minutos.
- O SQL é do agente e roda com permissão total no banco escolhido. Por isso as travas:
  - só depois do PR aberto e só para dono ou administrador;
  - o cartão mostra o SQL **completo** de cada migração; nenhum projeto vem escolhido, e para aplicar é preciso marcar
    a confirmação e **digitar o nome do projeto**;
  - o servidor confere a impressão digital (SHA-256) do SQL que a tela mostrou e recusa se mudou;
  - a Forja **bloqueia**:
    - nome sem data e hora (a versão no histórico precisa ser estável, senão a migração rodaria de novo a cada clique);
    - `begin`/`commit`/`rollback` (quebrariam o "inteira ou nada");
    - arquivo com mais de 100 mil caracteres;
  - e **avisa** quando o SQL:
    - apaga dados (`drop`, `truncate`, `delete`);
    - desliga a RLS;
    - dá permissão a `anon`/`authenticated`;
    - tem política `using (true)`;
    - mexe em papéis, `security definer`, rede de dentro do banco, ou nos schemas `auth`/`storage`.
  - Vale o SQL aprovado na Forja: mudanças feitas depois no PR do GitHub não entram (aplique essas pelo Supabase CLI).
  - A tela recomenda um projeto de teste antes do de produção.
- **Preview**:
  - Só dono ou administrador cria um projeto **novo** na conta da Vercel. Membros publicam o preview quando o projeto
    do repositório já existe.
  - Duas publicações ao mesmo tempo (o preview automático e um clique) não criam dois projetos: a primeira reserva a
    tarefa.

**O que não faz ainda**: variáveis de ambiente do projeto na Vercel (ex.: a URL do Supabase criado) e o deploy de
produção. O merge do PR no GitHub dispara a produção pela integração Git da própria Vercel.

## Limites e proteções

| Proteção | Valor |
|---|---|
| Teto por tarefa | escolhido pela pessoa (R$ 1 a R$ 500); o agente para sozinho quando chega nele |
| Saldo reservado | o teto de cada tarefa em andamento fica reservado; a próxima só pega o saldo livre |
| Tarefas ao mesmo tempo | 2 por organização |
| Teto diário | R$ 100 por organização (o dono ou admin muda em Agente) |
| Passos por tarefa | 40 |
| Parar | a pessoa para a qualquer momento; o que já foi feito pode virar PR ou ser descartado |
| Uma execução por vez | trava com validade (`runner_until`): dois executores nunca pegam a mesma tarefa |

**Segurança do repositório (prompt injection)**: o agente v1 **não executa nada**: sem comandos, sem rede, sem
instalar pacotes. Ele só lê e altera a cópia, e o único efeito no mundo é o PR que um humano aprova. Caminhos com
`..`, `/` no começo ou `.git/` são recusados. O prompt manda tratar o conteúdo do repositório como dado, não ordem.

## Execução na Vercel (Hobby)

- A tarefa roda logo depois de criada (`after`), por até ~4 minutos por vez.
- Se não terminar nesse tempo, a tela aberta retoma a cada consulta.
- Se a pessoa fechar a página, a tarefa continua quando ela voltar.
- No plano Pro (funções de até 800 s) cabe mais em cada parte. Uma fila de jobs (Inngest ou Trigger.dev) entra quando
  o agente passar a rodar testes num sandbox (fase 2).

## O que configurar

- **GitHub App**: siga `docs/cowork/03-github-app-agentes.md`. As credenciais ficam nos **Secrets do Supabase**:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_SLUG`
  - `GITHUB_APP_CLIENT_ID`
  - `GITHUB_APP_CLIENT_SECRET`
  - `GITHUB_APP_PRIVATE_KEY`
- A função `forja-chaves` entrega essas credenciais junto com as chaves dos modelos. Também funcionam como variável de
  ambiente na Vercel.

## Testes

- `pnpm --filter @forja/agent test`: tarball do GitHub, ferramentas, caminhos perigosos, JWT do app e estado assinado.
- `pnpm --filter @forja/agent test:integracao`: Postgres real, GitHub simulado (confere o JWT do app) e modelo
  roteirizado. São 35 checagens:
  - pedido → PR;
  - custo por passo e débito no saldo;
  - teto da tarefa, parar e descartar;
  - simultâneas, saldo reservado e teto diário;
  - trava de execução e retomada;
  - repositório vazio e repositório sem acesso;
  - modelo sem ferramentas e organização sem plano.
  - entrega:
    - conversa → tarefa → PR → preview na Vercel (projeto criado, build, erro, sem acesso, token inválido);
    - migrações aplicadas num Postgres de verdade no papel do banco do cliente (RLS, histórico do CLI, falha no meio
      sem deixar nada pela metade, projeto iniciando, projeto de outra conta).
- `test-integracao/servidores-app.ts`: sobe o GitHub e o modelo simulados para testar pelo app no navegador.

## Ainda não feito

- Rodar testes e build num sandbox antes do PR (fase 2): hoje o agente revisa lendo.
- Anexos no chat (imagem e PDF).
- Gemini no agente: o adaptador do Google ainda não tem chamada com ferramentas.
- Webhook do GitHub App (desinstalação é percebida no próximo uso).
