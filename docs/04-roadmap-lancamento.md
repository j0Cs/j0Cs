# 4. Roadmap até o lançamento (janeiro/2027)

Hoje: **04/11/2026**. Meta: **beta fechado em 04/01/2027** e **lançamento público por volta de 20/01/2027**.
São cerca de 7 semanas úteis de construção antes do recesso. Sprints de 1 a 2 semanas, cada uma terminando com algo
que funciona em produção (staging).

## Sprint 0: Fundação ✅ (04/11, este PR)

- Monorepo: `apps/web`, `apps/admin`, `packages/core|db|ui`
- Gateway de IA com 4 provedores e 13 modelos: streaming, cache de prompt, fallback da Anthropic, failover de chaves
- Medição de tokens, custo em US$, cobrança em R$, extrato de créditos e bloqueio por plano e saldo (21 testes)
- Área do cliente: projetos, chat multi-modelo, conectores com verificação, custos, plano e tabela de preços
- Painel do dono: visão geral (MRR, custo, margem), clientes, catálogo e preços, chaves, planos com simulador, câmbio via PTAX
- Planos de produto, arquitetura, precificação e este roadmap

## Sprint 1: Contas reais e staging (05/11 → 15/11)

- [x] Login com **Better Auth**: e-mail e senha, link mágico, GitHub OAuth (falta criar o OAuth App), recuperação de senha
- [x] Organizações: cadastro já cria a empresa no **teste grátis** (7 dias, R$ 10, só modelos econômicos), troca entre
  organizações, convites por e-mail com limite de assentos, papéis dono/admin/membro
- [x] Confirmação de e-mail obrigatória para usar os modelos (anti-abuso do teste grátis)
- [x] Painel do dono com login próprio, **2FA obrigatório**, só contas "staff" e allowlist de IP (saiu o HTTP Basic)
- [ ] E-mail transacional em produção: conta no Resend + domínio verificado (SPF/DKIM)
- [ ] Deploy de **staging**: Vercel (região GRU) + Postgres em São Paulo + variáveis no cofre
- [ ] **Chaves reais dos 4 provedores** e smoke test com cada modelo (validar formatos de uso, principalmente xAI e Gemini)
- [ ] Monitoramento de erros (Sentry) e logs estruturados do gateway
- [ ] **Começar a gastar nas APIs agora**: os limites de taxa (tiers) de Anthropic e OpenAI sobem conforme o histórico
  de gasto. Peça aumento de limite antes do lançamento

## Sprint 2: Dinheiro entrando (16/11 → 29/11)

- [ ] **Asaas**: assinatura recorrente (cartão + Pix Automático + boleto), webhooks → créditos do plano a cada ciclo
- [ ] Recargas avulsas e recarga automática; e-mail de saldo baixo (20% e 5%)
- [ ] Inadimplência: aviso, carência de 3 dias e suspensão automática
- [ ] Emissão automática de **NFS-e**
- [ ] Página pública de preços + checkout + teste grátis de 7 dias (só modelos econômicos)
- [ ] **Termos de uso, política de privacidade e DPA (LGPD)** revisados por advogado
- [ ] Abrir/ajustar CNPJ e regime tributário com o contador (ver doc 3, seção 7)

## Sprint 3: Agente v1 com GitHub (30/11 → 13/12)

- [ ] **GitHub App** (instala em 1 clique, escolhe os repositórios), substituindo o token manual
- [ ] Ferramentas do agente: listar arquivos, ler arquivo, buscar no código, propor diff, **abrir pull request**
- [ ] Loop de ferramentas no gateway, com medição por iteração e teto de gasto por tarefa (o cliente define, ex.: "até R$ 20")
- [ ] Interface: Markdown e código com destaque, anexos (imagens, PDF), botão "copiar"
- [ ] Limite de concorrência e teto diário por organização (proteção contra abuso e saldo negativo)

## Sprint 4: Deploy e operação (14/12 → 23/12)

- [ ] Conector **Vercel**: criar projeto a partir do repositório, preview por PR, link no chat
- [ ] Conector **Supabase**: criar projeto/banco e rodar migrações geradas pelo agente
- [ ] **Conciliação de custos**: comparar `usage_events` com os relatórios de uso dos provedores (APIs de admin/uso
  de cada um) e alertar divergência acima de 2%
- [ ] Alertas para o dono: cliente com margem negativa, chave falhando, provedor com erro acima de 2%, câmbio desatualizado
- [ ] Backup diário verificado e plano de resposta a incidentes (vazamento de chave = rotacionar em 15 minutos)

## Recesso (24/12 → 03/01)

Congelamento: só correção de bugs. Aproveite para gravar vídeos de demonstração e preparar a landing page.

## Sprint 5: Beta fechado (04/01 → 17/01/2027)

- [ ] 10 a 20 clientes convidados (software houses e agências conhecidas) com **preço de fundador** (ex.: Pro por R$ 297
  por 6 meses em troca de feedback e depoimento)
- [ ] Medir: utilização de créditos, modelos mais usados, taxa de acerto do cache, margem real por cliente
- [ ] Ajustar preços e markups com dados reais (o painel permite sem deploy)
- [ ] Onboarding guiado: primeiro projeto, primeiro conector, primeira resposta em menos de 10 minutos

## Lançamento público (~20/01/2027)

Landing page, conteúdo (comparativos de modelos em português, tutoriais) e comunidade (Discord/WhatsApp).

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
| Concorrentes grandes (Cursor, Lovable, Bolt, Replit) | Pressão de preço | Foco no Brasil: reais, Pix, nota fiscal, suporte em PT-BR, gestão de equipe e custo multi-modelo |

## Checklist de lançamento

- [ ] Termos de uso, privacidade e DPA publicados
- [ ] CNPJ, regime tributário e emissão de NFS-e funcionando
- [ ] Chaves de produção dos 4 provedores, com alerta de gasto configurado no console de cada um
- [ ] 2FA no painel do dono; `ENCRYPTION_KEY` de produção diferente da de staging
- [ ] Backup testado (restaurar de verdade uma vez)
- [ ] Página de status e canal de suporte
- [ ] Preços revisados com câmbio do dia e preços dos provedores do mês
