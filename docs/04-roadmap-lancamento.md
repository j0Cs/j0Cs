# 4. Roadmap até o lançamento (janeiro/2027)

Atualizado em **05/11/2026**. Meta: **beta fechado em 04/01/2027** e **lançamento público por volta de 20/01/2027**.
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

- [ ] **[Você]** Conta Stripe Brasil verificada (CNPJ e conta bancária); chaves de **teste** já na primeira semana
- [ ] **[Claude]** Assinatura dos planos (Starter, Pro, Max, Equipe por assento) pelo Stripe Checkout, no cartão ou
  boleto; Customer Portal em português para trocar de plano, atualizar cartão e cancelar
- [ ] **[Claude]** Webhooks idempotentes (cada evento processado uma única vez): `invoice.paid` → créditos do plano no
  ciclo; mudança ou cancelamento de assinatura → plano e assentos atualizados
- [ ] **[Claude]** Recarga avulsa por **Pix** ou cartão, com o crédito entrando na hora do pagamento
- [ ] **[Claude]** E-mails de saldo baixo (20% e 5%) e de recarga confirmada
- [ ] **[Claude]** Inadimplência: aviso no pagamento recusado, 3 dias de carência, suspensão automática e reativação
  quando pagar
- [ ] **[Claude]** Fim do teste grátis em 7 dias (verificação diária, compatível com o Hobby): bloqueia o uso, mantém
  os dados e mostra o caminho para assinar
- [ ] **[Claude]** Página pública de preços (`/precos`) ligada ao checkout
- [ ] **[Claude]** Painel do dono: assinaturas, receita por mês, falhas de pagamento e reembolso
- [ ] **[Claude]** Rascunho de termos de uso e política de privacidade; **[Você]** revisão com advogado
- [ ] **[Você]** CNPJ, regime tributário e emissor de NFS-e com o contador (doc 3, seção 7). A emissão automática
  (NFE.io) entra assim que houver CNPJ; se atrasar, ela passa para a Sprint 4

Pronto quando: no modo de teste do Stripe, uma empresa assina o Pro, recebe os créditos, recarrega por Pix, tem um
pagamento recusado (aviso → suspensão → reativação) e cancela pelo portal, e tudo aparece certo no painel do dono.

## Sprint 3: Agente v1 com GitHub (30/11 → 11/12)

Objetivo: o cliente pede uma mudança em linguagem natural e recebe um pull request pronto para revisar.

- [ ] **[Você]** Criar o GitHub App "Forja Agentes" (o prompt do Cowork já reserva o nome); **[Claude]** configura
  as permissões mínimas: código e pull requests do repositório escolhido
- [ ] **[Claude]** Instalação em 1 clique por organização, com escolha dos repositórios. Tokens de instalação de curta
  duração: nenhum token pessoal guardado
- [ ] **[Claude]** Ferramentas do agente: listar arquivos, ler arquivo, buscar no código, escrever numa branch, abrir PR
- [ ] **[Claude]** Loop de ferramentas no gateway com medição por passo, **teto de gasto por tarefa** definido pelo
  cliente (ex.: "até R$ 20") e botão de parar
- [ ] **[Claude]** Tela da tarefa: plano → passos ao vivo → diff → link do PR; o cliente aprova antes de abrir o PR
- [ ] **[Claude]** "Gerar projeto" da call vira a primeira tarefa do agente (a especificação viva entra como pedido)
- [ ] **[Claude]** Chat: Markdown e código com destaque, anexos (imagem e PDF), botão copiar
- [ ] **[Claude]** Proteções: tarefas simultâneas por organização, teto diário e saldo reservado durante a tarefa

Pronto quando: num repositório de teste, "adicione uma página de contato com formulário" vira um PR que compila, com o
custo da tarefa mostrado e abaixo do teto.

## Sprint 4: Deploy e operação (14/12 → 23/12)

Objetivo: o código do agente sai do PR e vira um site no ar, e o dono enxerga problema antes do cliente.

- [ ] **[Claude]** Conector **Vercel**: criar o projeto a partir do repositório, preview a cada PR, link no chat
- [ ] **[Claude]** Conector **Supabase**: criar projeto e banco, rodar as migrações geradas pelo agente
- [ ] **[Claude]** Conciliação de custos: comparar o uso registrado com o relatório de cada provedor e alertar
  diferença acima de 2%
- [ ] **[Claude]** Alertas para o dono: cliente com margem negativa, chave falhando, provedor com erro acima de 2%,
  câmbio desatualizado (com atualização diária da PTAX)
- [ ] **[Claude]** Backup diário fora da Supabase e um teste de restauração de verdade; plano de incidente (chave
  vazada = rotacionada em 15 minutos)
- [ ] **[Você]** Plano **Pro** da Vercel (US$ 20/mês). **[Claude]** volta a varredura das calls para cada minuto,
  liga `VOZ_NUVEM_HABILITADA` e faz o primeiro teste da voz em nuvem com a chave real da OpenAI
- [ ] **[Claude]** Segredos novos de produção (os atuais passaram pela conversa) e revisão de segurança final

Pronto quando: do chat, o agente abre o PR, a Vercel publica o preview e o link aparece na conversa; um alerta de
teste chega ao dono por e-mail; o backup é restaurado num banco separado.

## Recesso (24/12 → 03/01)

Congelamento: só correção de bugs. Bom momento para gravar vídeos de demonstração e revisar a landing page.

## Sprint 5: Beta fechado (04/01 → 15/01/2027)

Objetivo: 10 a 20 empresas usando de verdade, pagando preço de fundador, e dados para ajustar preço e produto.

- [ ] **[Você]** Lista de convidados (software houses e agências conhecidas) e oferta de fundador (ex.: Pro por
  R$ 297 por 6 meses em troca de feedback e depoimento); **[Claude]** cria o cupom no Stripe e o convite por link
- [ ] **[Claude]** Onboarding guiado: primeiro projeto, primeiro conector e primeira resposta em menos de 10 minutos
- [ ] **[Claude]** Métricas no painel: créditos usados, modelos mais usados, acerto do cache, margem real por cliente,
  funil cadastro → confirmação → primeira resposta → assinatura
- [ ] **[Claude]** Landing page, página de status e canal de suporte (e-mail e WhatsApp)
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

## Depois do lançamento (fevereiro a abril)

1. **Sandbox de execução** (E2B, Vercel Sandbox ou Daytona): o agente roda testes e mostra o app funcionando ao vivo
2. **Roteamento inteligente**: o sistema sugere ou escolhe o modelo mais barato que resolve a tarefa
3. **Automações**: tarefas agendadas e por webhook (ex.: "toda segunda, revise os PRs abertos")
4. **BYOK** no self-service e plano Enterprise com SSO
5. Mais conectores: Netlify, Railway, Jira, Linear, Slack, Notion

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
