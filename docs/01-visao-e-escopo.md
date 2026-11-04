# 1. Visão e escopo

## O problema

Construir software com IA ficou fácil, mas as assinaturas individuais (Claude Pro, ChatGPT Plus, SuperGrok…) têm
limites de uso que acabam no meio do trabalho, cada uma fica numa conta e num cartão diferentes e são cobradas em dólar.
Uma empresa com várias pessoas e vários projetos não tem visão de quanto gasta, com quem e em quê.

## A proposta

Um ambiente único, em português, cobrado em reais, onde a empresa:

1. **Escolhe o modelo certo para cada tarefa.** Opus ou Fable para arquitetura difícil, Sonnet ou Sol para o dia a dia,
   Haiku ou Luna para tarefas simples, tudo na mesma conversa.
2. **Organiza o trabalho em projetos**, cada um com instruções fixas, repositório, histórico de conversas e custo acumulado.
3. **Conecta as ferramentas que já usa** (GitHub, Vercel, Supabase, Postgres) para que os agentes leiam código, abram PRs,
   criem bancos e façam deploy.
4. **Enxerga e controla o custo**: cada resposta mostra quanto custou, há relatório por modelo, projeto e dia, e o consumo
   para quando o saldo acaba, sem surpresa na fatura.

O diferencial não é token mais barato: revendendo API não dá para ganhar das assinaturas dos próprios fabricantes em
preço por token. O diferencial é **ter vários modelos e as integrações num lugar só, com gestão de equipe e de custo,
cobrança em reais (Pix, boleto, nota fiscal) e suporte em português**.

## Público inicial

- **Software houses e agências pequenas (2 a 20 devs)**, o melhor encaixe: vários projetos, vários clientes, precisam de controle de custo.
- **Devs autônomos e freelancers** que hoje pagam 2 ou 3 assinaturas em dólar.
- **Empresas não técnicas com um "dev da casa"** que querem automatizar processos internos.

## Escopo do lançamento (janeiro/2027)

| Entra | Fica para depois |
|---|---|
| Login com e-mail e GitHub, organizações, convites, 2FA | SSO corporativo (SAML) |
| 4 provedores e cerca de 13 modelos, chat com streaming, troca de modelo na conversa | Geração de imagem e voz |
| Projetos com instruções, histórico e custo | Templates de projeto |
| Agente v1: lê o repositório, propõe mudanças e abre PR no GitHub | Execução de código em sandbox com preview ao vivo |
| Conectores GitHub (App), Vercel, Supabase, Postgres | Netlify, Railway, Jira, Slack |
| Assinatura + créditos + recarga (Pix/cartão/boleto) com NFS-e | Cobrança por uso pós-paga (fatura no fim do mês) |
| Painel do dono: MRR, custo, margem, chaves, preços, planos | Previsão de demanda e alertas automáticos avançados |
| Traga sua própria chave (BYOK) para Enterprise | Marketplace de agentes |

## Métricas que importam

- **Margem bruta por cliente** (assinatura + consumo − custo de API − infra), acompanhada no painel do dono.
- **Utilização dos créditos do plano.** Abaixo de 30% indica risco de cancelamento; acima de 90% é cliente para upgrade.
- **Taxa de acerto do cache de prompt.** É o que mais derruba o custo (ver doc 3).
- Ativação (primeira resposta útil em menos de 10 minutos), retenção no mês 2 e cancelamento mensal.
