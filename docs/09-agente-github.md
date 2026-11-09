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
- `test-integracao/servidores-app.ts`: sobe o GitHub e o modelo simulados para testar pelo app no navegador.

## Ainda não feito

- Rodar testes e build num sandbox antes do PR (fase 2): hoje o agente revisa lendo.
- Anexos no chat (imagem e PDF).
- Gemini no agente: o adaptador do Google ainda não tem chamada com ferramentas.
- Webhook do GitHub App (desinstalação é percebida no próximo uso).
