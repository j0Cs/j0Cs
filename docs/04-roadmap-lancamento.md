# 4. Roadmap até o lançamento (janeiro/2027)

Atualizado em **10/11/2026**. Meta: **beta fechado em 04/01/2027** e **lançamento público por volta de 20/01/2027**.
São cerca de 7 semanas úteis de construção antes do recesso. Sprints de 1 a 2 semanas, cada uma terminando com algo
que funciona em produção (staging).

## Sprint 0: Fundação ✅ (04/11, este PR)

- Monorepo: `apps/web`, `apps/admin`, `packages/core|db|ui`
- Gateway de IA com 4 provedores e 13 modelos: streaming, cache de prompt, fallback da Anthropic, failover de chaves
- Medição de tokens, custo em US$, cobrança em R$, extrato de créditos e bloqueio por plano e saldo (21 testes)
- Área do cliente: projetos, chat multi-modelo, conectores com verificação, custos, plano e tabela de preços
- Painel do dono: visão geral (MRR, custo, margem), clientes, catálogo e preços, chaves, planos com simulador, câmbio via PTAX
- Planos de produto, arquitetura, precificação e este roadmap

## Sprint 1: Contas reais e produção ✅ (05/11)

- [x] Login com **Better Auth** (e-mail e senha, link mágico, GitHub OAuth, recuperação de senha), organizações, teste
  grátis, convites com limite de assentos, papéis, confirmação de e-mail obrigatória
- [x] Painel do dono com login próprio, **2FA obrigatório**, só contas "staff" e allowlist de IP
- [x] E-mail transacional pelo **Microsoft 365** (código pronto; falta a configuração na conta, ver Sprint 1b)
- [x] **Central de comando** (`/central`) e **modo call** com o agente Hefesto: voz do navegador, legendas,
  interrupção, especificação viva e "gerar projeto"; voz em nuvem pronta, desligada até o Pro (doc 7)
- [x] Duas revisões de segurança e cobrança com correções (limites de tentativa, redirecionamentos, voz, cobrança)
- [x] **Publicado** na Vercel (Hobby) com o banco da Supabase pela integração: `forja-web` e `forja-admin` em produção

## Legenda

- **[Claude]**: código, testes e deploy, feito aqui na conversa.
- **[Você]**: conta, contrato, pagamento ou acesso que só o dono pode fazer (o Cowork ajuda em vários).
- **Pronto quando**: o teste que fecha a sprint. Sem isso, a sprint não terminou.

## Sprint 1b: Produção usável por convidados (09/11 → 13/11)

Objetivo: qualquer pessoa convidada consegue se cadastrar, confirmar o e-mail e conversar com os 16 modelos.

- [ ] **[Você]** Cadastrar no painel as chaves de API dos 4 provedores (Anthropic, OpenAI, Google, xAI)
- [ ] **[Claude]** Teste de fumaça em produção: cada modelo responde uma vez, e o custo e a cobrança batem com a tabela
- [ ] **[Você]** Configurar o Microsoft 365 com o prompt `cowork/02-microsoft-365-email.md`
- [ ] **[Claude]** Testar os e-mails reais: confirmação, link mágico, redefinição de senha e convite
- [ ] **[Você]** Criar o OAuth App do GitHub de produção com o prompt `cowork/01-github-login.md`
- [ ] **[Você]** Desligar a Data API na Supabase
- [ ] **[Você]** Pedir aumento de limite (tier) na Anthropic e na OpenAI; ligar alerta de gasto no console de cada provedor
- [ ] **[Claude]** Monitoramento de erros (Sentry) nos dois apps e alerta por e-mail para o dono
- [ ] **[Claude]** Terminar a revisão independente da 2ª rodada de correções (3 dos 5 agentes não chegaram a rodar)
- [ ] **[Você]** Escolher o nome definitivo e o domínio (ex.: `app.seudominio.com.br`); **[Claude]** liga o domínio
  nos dois projetos e ajusta `WEB_URL`/`ADMIN_URL`

Pronto quando: uma conta nova criada em produção recebe o e-mail, confirma e recebe resposta de um modelo de cada
provedor, com o custo aparecendo em "Custos" e no painel do dono.

## Sprint 2: Dinheiro entrando (16/11 → 27/11)

Objetivo: o cliente assina, paga, recebe créditos e é cobrado de novo todo mês, sem ninguém mexer à mão.

> **Adiantada em 05/11**: a parte de código está pronta e testada com um Stripe simulado (doc 8). Falta a sua parte:
> conta Stripe, chaves de teste, webhook e portal (doc 8, "O que você configura"), e o teste com o Stripe de verdade.

- [ ] **[Você]** Conta Stripe Brasil verificada (CNPJ e conta bancária); chaves de **teste** já na primeira semana
- [x] **[Claude]** Assinatura dos planos (Starter, Pro, Max, Equipe por assento) pelo Stripe Checkout, no cartão ou
  boleto; troca de plano e de assentos no próprio app; Customer Portal em português para cartão, faturas e cancelamento
- [x] **[Claude]** Webhooks idempotentes (cada evento processado uma única vez): `invoice.paid` → créditos do plano no
  ciclo; mudança ou cancelamento de assinatura → plano e assentos atualizados
- [x] **[Claude]** Recarga avulsa por **Pix** ou cartão, com o crédito entrando na hora do pagamento
- [x] **[Claude]** E-mails de saldo baixo (20% e 5%) e de recarga confirmada
- [x] **[Claude]** Inadimplência: aviso no pagamento recusado, 3 dias de carência, suspensão automática e reativação
  quando pagar
- [x] **[Claude]** Fim do teste grátis em 7 dias (verificação diária, compatível com o Hobby): bloqueia o uso, mantém
  os dados e mostra o caminho para assinar
- [x] **[Claude]** Página pública de preços (`/precos`) ligada ao checkout
- [x] **[Claude]** Painel do dono: assinaturas, receita por mês, falhas de pagamento e reembolso
- [ ] **[Claude]** Rascunho de termos de uso e política de privacidade; **[Você]** revisão com advogado
- [ ] **[Você]** CNPJ, regime tributário e emissor de NFS-e com o contador (doc 3, seção 7). A emissão automática
  (NFE.io) entra assim que houver CNPJ; se atrasar, ela passa para a Sprint 4

Pronto quando: no modo de teste do Stripe, uma empresa assina o Pro, recebe os créditos, recarrega por Pix, tem um
pagamento recusado (aviso → suspensão → reativação) e cancela pelo portal, e tudo aparece certo no painel do dono.

## Sprint 3: Agente v1 com GitHub (30/11 → 11/12)

Objetivo: o cliente pede uma mudança em linguagem natural e recebe um pull request pronto para revisar.

> **Adiantada em 09/11**: código pronto e testado com GitHub e modelo simulados (doc 9). Falta criar o GitHub App e
> guardar as credenciais nos Secrets do Supabase (`docs/cowork/03-github-app-agentes.md`). Anexos no chat (imagem e
> PDF) ficaram para a próxima rodada.

- [ ] **[Você]** Criar o GitHub App "Forja Agentes" (o prompt do Cowork já reserva o nome); **[Claude]** configura
  as permissões mínimas: código e pull requests do repositório escolhido
- [x] **[Claude]** Instalação em 1 clique por organização, com escolha dos repositórios. Tokens de instalação de curta
  duração: nenhum token pessoal guardado
- [x] **[Claude]** Ferramentas do agente: listar arquivos, ler arquivo, buscar no código, escrever numa branch, abrir PR
- [x] **[Claude]** Loop de ferramentas no gateway com medição por passo, **teto de gasto por tarefa** definido pelo
  cliente (ex.: "até R$ 20") e botão de parar
- [x] **[Claude]** Tela da tarefa: plano → passos ao vivo → diff → link do PR; o cliente aprova antes de abrir o PR
- [x] **[Claude]** "Gerar projeto" da call vira a primeira tarefa do agente (a especificação viva entra como pedido)
- [x] **[Claude]** Chat: Markdown e código com destaque, botão copiar (anexos de imagem e PDF: próxima rodada)
- [x] **[Claude]** Proteções: tarefas simultâneas por organização, teto diário e saldo reservado durante a tarefa

Pronto quando: num repositório de teste, "adicione uma página de contato com formulário" vira um PR que compila, com o
custo da tarefa mostrado e abaixo do teto.

## Sprint 4: Deploy e operação (14/12 → 23/12)

Objetivo: o código do agente sai do PR e vira um site no ar, e o dono enxerga problema antes do cliente.

> **Adiantada em 09/11**: código pronto e testado com Vercel, Supabase e GitHub simulados e um Postgres de verdade
> fazendo o papel do banco do cliente (docs 9 e 10). Falta, do seu lado:
> - criar o GitHub App (Sprint 3);
> - ligar o backup no GitHub (`docs/cowork/04-backup.md`);
> - trocar os segredos que passaram pela conversa (doc 10).

- [x] **[Claude]** Conector **Vercel**: cria o projeto a partir do repositório (framework detectado), publica o preview da
  branch de cada PR e manda o link para a conversa
- [x] **[Claude]** Conector **Supabase**: cria projeto e banco (São Paulo) e aplica as migrações do agente, com
  confirmação, uma de cada vez e no histórico do Supabase CLI
- [x] **[Claude]** "Enviar ao agente" no chat: a conversa vira o pedido, e os links do PR e do preview voltam para ela
- [x] **[Claude]** Conciliação de custos: compara o uso registrado com o relatório da Anthropic e da OpenAI e alerta
  diferença acima de 2%
- [x] **[Claude]** Alertas para o dono: cliente com margem negativa, chave falhando, provedor com erro acima de 2%,
  câmbio desatualizado (com atualização diária da PTAX) e backup; e-mail para a equipe e alerta de teste
- [x] **[Claude]** Backup diário fora da Supabase (GitHub Actions, cifrado) com restauração de teste todo dia; teste
  de restauração de verdade feito; plano de incidente (doc 10)
- [ ] **[Você]** Ligar o backup: chaves e acesso gerados no painel, uma variável e um secret no GitHub
  (`docs/cowork/04-backup.md`). O agendamento começa quando o PR entrar na `main`
- [x] **[Claude]** Rotação da `ENCRYPTION_KEY` sem precisar ler a antiga (chaves numeradas + Recifrar no painel),
  troca de senha do painel e gerador de segredos no navegador
- [ ] **[Você]** Trocar os segredos que passaram pela conversa (doc 10, uns 20 minutos)
- [x] **[Claude]** Revisão de segurança final
- [ ] **[Você]** Plano **Pro** da Vercel (US$ 20/mês). **[Claude]** volta a varredura das calls para cada minuto,
  liga `VOZ_NUVEM_HABILITADA` e faz o primeiro teste da voz em nuvem com a chave real da OpenAI

Pronto quando: do chat, o agente abre o PR, a Vercel publica o preview e o link aparece na conversa; um alerta de
teste chega ao dono por e-mail; o backup é restaurado num banco separado.

## Sprint 4b: Assinatura do cliente, time de especialistas e QA ✅ (09/11)

Objetivo: o cliente constrói com a própria assinatura (Claude Code, Codex, Gemini CLI, Grok Build) e a Forja entra
como time de especialistas e QA (doc 11).

- [x] **[Claude]** Botão **Conectar repositório** no projeto: estrutura, stack, pastas, instruções de IA e README, usados
  no chat e na call
- [x] **[Claude]** **Time de especialistas**: Dev Sênior, Dev Pleno, QA Pleno e Cyber Security Pleno. São usados na
  auditoria, na revisão de PR, no chat ("Falar com") e no agente. Também são instalados no repositório do cliente por
  PR: subagentes e skills do Claude Code, `AGENTS.md`, `GEMINI.md` e comandos do Gemini CLI
- [x] **[Claude]** **Auditoria** do projeto (só leitura, varredura grátis, parecer de cada papel, notas, "Corrigir com o
  agente") e **revisão de QA de pull request** com veredito e publicação no PR
- [x] **[Claude]** **Assistentes de IA**: telemetria OTLP das quatro ferramentas, painel de uso, recomendações de
  economia e gasto real com chave de administração (Anthropic e OpenAI)
- [x] **[Claude]** Conectores novos com verificação: GitLab, Bitbucket, Azure DevOps, Netlify, Cloudflare, Railway,
  Render, Fly.io, Neon, Turso, PlanetScale e as chaves de administração
- [ ] **[Você]** Domínio próprio (a telemetria dos clientes não passa pela Vercel Authentication dos `*.vercel.app`)

Login de assinatura dentro da Forja **não** entra: os termos da Anthropic e da Google proíbem, e a OpenAI só permite
para parceiros aprovados (doc 11, seção 1).

## Sprints D1 e D2: App desktop da Forja (macOS Intel e Apple Silicon, Windows), últimas de construção

Objetivo: o mesmo produto num app instalável, com o que só dá para fazer na máquina do cliente. Fica para as últimas
sprints, depois do núcleo web. Com o adiantamento das Sprints 3 e 4, cabe antes do beta, e o desktop entra no beta.

> **Sprint D1 feita em 10/11** (doc 13). Falta a D2 e o que depende das contas de assinatura.

- [x] **[Claude]** Base: **Electron** carregando o app web, com janela, menu, bandeja, notificações, link `forja://`
  e login pelo navegador. Electron em vez de Tauri porque reaproveita direto o código TypeScript que já existe (leitura
  de estrutura, varredura, time, configuração da telemetria)
- [x] **[Claude]** Recursos locais (D1):
  - abrir uma pasta do computador e ler a estrutura e a varredura sem GitHub;
  - instalar o time nos arquivos locais;
  - **configurar a telemetria** do Claude Code, do Codex e do Gemini CLI com um clique (edita `~/.claude/settings.json`,
    `~/.codex/config.toml` e `~/.gemini/settings.json`, mostrando antes o que muda).

  As ferramentas do cliente continuam rodando por conta própria: o app não dirige o Claude Code com a assinatura do
  cliente, o que os termos também proíbem
- [ ] **[Claude]** Recursos locais (D2): auditoria e revisão da branch local com o time
- [x] **[Claude]** Builds e CI: GitHub Actions com macOS arm64 e x64 (`.dmg` de cada um) e Windows x64 (instalador
  NSIS). Atualização automática pelos releases
- [ ] **[Claude]** D2: assinatura do Windows no CI e Windows arm64 se houver demanda
- [ ] **[Você]** Testar o instalador num Mac e num Windows de verdade
- [ ] **[Você]** Conta **Apple Developer** (US$ 99/ano) para assinar e notarizar no macOS. Sem isso o Gatekeeper
  avisa na primeira abertura e a atualização automática do Mac não funciona
- [ ] **[Você]** Certificado de **assinatura de código do Windows** (Azure Trusted Signing, cerca de US$ 10/mês, ou um
  certificado OV/EV). Sem isso o SmartScreen avisa "editor desconhecido"
- [x] **[Claude]** Página de download que detecta o sistema e o processador (`/baixar`)

Pronto quando: o app instala e abre assinado no Mac (Intel e M1 ou mais novo) e no Windows; configura a telemetria do
Claude Code local com um clique; e atualiza sozinho para uma versão nova.

## Recesso (24/12 → 03/01)

Congelamento: só correção de bugs. Bom momento para gravar vídeos de demonstração e revisar a landing page.

## Sprint 5: Beta fechado (04/01 → 15/01/2027)

Objetivo: 10 a 20 empresas usando de verdade, pagando preço de fundador, e dados para ajustar preço e produto.

> **Adiantada em 10/11**: as ferramentas do beta estão prontas (doc 12). Falta a parte que depende de gente e de dados.

- [ ] **[Você]** Lista de convidados (software houses e agências conhecidas) e oferta de fundador (ex.: Pro por
  R$ 297 por 6 meses em troca de feedback e depoimento)
- [x] **[Claude]** Convite de fundador por link, com teste maior, créditos e cupom do Stripe aplicado na assinatura
- [x] **[Claude]** Onboarding guiado: confirmar e-mail, primeiro projeto, primeiro pedido e GitHub
- [x] **[Claude]** Métricas no painel: empresas ativas, funil, modelos mais usados, acerto do cache e margem por cliente
- [x] **[Claude]** Site, página de status e canal de suporte (e-mail e WhatsApp)
- [ ] **[Você]** `SUPORTE_EMAIL`, `SUPORTE_WHATSAPP` e `WEB_URL` (painel) na Vercel
- [ ] **[Você + Claude]** Ajustar preços e margens com os dados reais (o painel muda sem deploy)

Pronto quando: pelo menos 10 empresas ativas na semana, nenhuma com margem negativa, e a lista de ajustes do
lançamento fechada.

## Lançamento público (~20/01/2027)

Landing page, conteúdo (comparativos de modelos em português, tutoriais) e comunidade (Discord ou WhatsApp).

## Decisões pendentes do dono

| Decisão | Até | Por quê |
|---|---|---|
| Nome e domínio definitivos | 13/11 | E-mails, OAuth do GitHub e cookies dependem do endereço final |
| CNPJ e regime tributário | 20/11 | Stripe verificado e NFS-e dependem disso |
| Plano Pro da Vercel | 14/12 | Voz em nuvem e uso comercial; o Hobby proíbe uso comercial |
| Oferta de fundador do beta | 18/12 | Cupom e convites prontos antes do recesso |
| Conta Apple Developer e certificado de código do Windows | antes das Sprints D1 e D2 | O app desktop só instala sem alertas se for assinado |

## Depois do lançamento (fevereiro a abril)

1. **Sandbox de execução** (E2B, Vercel Sandbox ou Daytona): o agente roda testes e mostra o app funcionando ao vivo
2. **Roteamento inteligente**: o sistema sugere ou escolhe o modelo mais barato que resolve a tarefa
3. **Automações**: tarefas agendadas e por webhook (ex.: "toda segunda, revise os PRs abertos")
4. **BYOK** no self-service e plano Enterprise com SSO
5. Mais conectores no agente: deploy pela Netlify, Railway e Render (já verificados na Sprint 4b), Jira, Linear, Slack e Notion

## Riscos e como mitigar

| Risco | Impacto | Mitigação |
|---|---|---|
| Limite de taxa dos provedores no lançamento | Clientes recebem erro | Pool com várias chaves + failover (já feito); pedir aumento de tier cedo; OpenRouter como reserva |
| Provedor muda preço (ex.: Gemini dobra em 01/01) | Margem cai | Catálogo editável; revisão mensal; o histórico guarda o preço usado |
| Real desvaloriza | Margem cai | Câmbio com folga e atualização pela PTAX em um clique; agendar atualização diária na Sprint 4 |
| Fraude/abuso (contas para gastar modelos caros) | Prejuízo direto | Trial só econômico, premium só com pagamento, teto diário por org |
| Vazamento de chave de API | Conta do provedor usada por terceiros | Criptografia em repouso, painel isolado com 2FA, rotação rápida, alertas de gasto no console de cada provedor |
| Modelo descontinuado | Conversas quebram | Desativar no catálogo e sugerir substituto; fallback automático na Anthropic |
| Plano Hobby da Vercel (cron 1x por dia, 100 deploys por dia, uso não comercial) | Voz em nuvem desligada; deploy bloqueado no limite | Assinar o Pro antes de cobrar o primeiro cliente (Sprint 4) |
| Concorrentes grandes (Cursor, Lovable, Bolt, Replit) | Pressão de preço | Foco no Brasil: reais, Pix, nota fiscal, suporte em PT-BR, gestão de equipe e custo multi-modelo |

## Checklist de lançamento

- [ ] Termos de uso, privacidade e DPA publicados
- [ ] CNPJ, regime tributário e emissão de NFS-e funcionando
- [ ] Chaves de produção dos 4 provedores, com alerta de gasto configurado no console de cada um
- [ ] 2FA no painel do dono; `ENCRYPTION_KEY` de produção diferente da de staging
- [ ] Backup testado (restaurar de verdade uma vez)
- [ ] Página de status e canal de suporte
- [ ] Preços revisados com câmbio do dia e preços dos provedores do mês
