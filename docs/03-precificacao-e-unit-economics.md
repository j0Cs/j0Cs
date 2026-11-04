# 3. Precificação e unit economics

> Os números usam as configurações padrão do sistema: câmbio **R$ 5,40**, sobrecusto de **15%** sobre o custo de API
> (IOF, spread e reserva para tributos), impostos sobre faturamento de **11%**, gateway de pagamento de **4%** e
> infra de **R$ 20 por assento**. Tudo é editável no painel do dono, e o simulador recalcula na hora. **Valide impostos com
> um contador antes de fixar preço** (detalhes no fim).

## 1. Por que não vender "ilimitado por R$ 400–500"

O consumo de um dev usando agentes varia mais de 100 vezes entre clientes. Um mês pesado com Claude Opus 5.5:

| Cenário (mesmo trabalho) | Custo de API | Custo efetivo em R$ |
|---|---|---|
| 100M tokens lidos do cache + 5M de entrada + 5M de escrita de cache + 2M de saída | US$ 105 | **R$ 652** |
| O mesmo trabalho **sem** cache de prompt (110M de entrada + 2M de saída) | US$ 480 | **R$ 2.981** |

Com plano fixo de R$ 447, um único cliente desses dá prejuízo, e os concorrentes que vendem "ilimitado" resolvem isso
com limites escondidos, que é justamente a reclamação que motivou o produto. Por isso a recomendação é:

**Assinatura mensal com créditos inclusos + recarga avulsa.** O cliente vê o custo de cada resposta, nunca é bloqueado
sem aviso e decide se recarrega. Você nunca vende abaixo do custo.

A tabela também mostra **por que o cache de prompt é a principal alavanca de margem**: o mesmo trabalho custa 4,5 vezes
menos com cache. O gateway já liga o cache automaticamente.

## 2. Como o preço de cada resposta é calculado

```
custo (US$)   = Σ tokens × preço do modelo por milhão (entrada, cache leitura, cache escrita, saída)
custo efetivo = custo × câmbio × (1 + sobrecusto)            → hoje US$ 1 = R$ 6,21
preço         = custo efetivo × (1 + markup do modelo)
```

Markup padrão por faixa: caro tem markup menor, para continuar competitivo; barato tem markup maior, porque em reais o
valor absoluto é pequeno.

| Faixa | Markup | Modelos | US$ 1 de API vira |
|---|---|---|---|
| Econômico | 100% | Haiku 5.5, GPT-6 Luna, Gemini 3.1 Flash-Lite | R$ 12,42 |
| Intermediário | 50% | Sonnet 5.5, GPT-6.1 Sol/Terra, Gemini 3.8 Flash, Grok 4.7, Grok Build | R$ 9,32 |
| Avançado | 50% | Opus 5.5, Gemini 4 Argon | R$ 9,32 |
| Premium | 35% | Fable 5.1, GPT-6 Astra | R$ 8,38 |

Tabela ao cliente, por 1 milhão de tokens (entrada / saída):

| Modelo | Custo do provedor | Preço ao cliente |
|---|---|---|
| Claude Fable 5.1 | US$ 10 / 50 | R$ 83,84 / 419,18 |
| Claude Opus 5.5 | US$ 4 / 20 | R$ 37,26 / 186,30 |
| Claude Sonnet 5.5 | US$ 2 / 10 | R$ 18,63 / 93,15 |
| Claude Haiku 5.5 | US$ 0,10 / 0,50 | R$ 1,24 / 6,21 |
| GPT-6 Astra | US$ 10 / 50 | R$ 83,84 / 419,18 |
| GPT-6.1 Sol | US$ 2 / 10 | R$ 18,63 / 93,15 |
| GPT-6.1 Terra | US$ 1 / 5 | R$ 9,32 / 46,58 |
| GPT-6 Luna | US$ 0,10 / 0,50 | R$ 1,24 / 6,21 |
| Gemini 4 Argon¹ | US$ 4 / 20 | R$ 37,26 / 186,30 |
| Gemini 3.8 Flash¹ | US$ 1,50 / 7,50 | R$ 13,97 / 69,86 |
| Grok 4.7 | US$ 2 / 6 | R$ 18,63 / 55,89 |

¹ Preços que o Google aplica a partir de 01/12/2026 (Argon) e 01/01/2027 (3.8 Flash); o catálogo já usa esses valores.
Preços conferidos nas páginas oficiais em 04/11/2026. Revise todo mês no painel (Modelos e preços).

## 3. O que os créditos compram (para a página de vendas)

Premissas: **"tarefa de agente"** = implementar uma funcionalidade média, com cerca de 40 chamadas que somam 2M de tokens
lidos do cache, 150 mil de entrada nova, 150 mil de escrita de cache e 60 mil de saída. **"Mensagem de chat"** = 5 mil
tokens de contexto (80% em cache) e 800 de resposta.

| Modelo | Tarefa de agente | Tarefas com R$ 300 | Mensagem de chat | Mensagens com R$ 300 |
|---|---|---|---|---|
| Claude Fable 5.1 | R$ 57,64 | 5 | R$ 0,43 | ~700 |
| GPT-6 Astra | R$ 67,07 | 4 | R$ 0,45 | ~660 |
| Claude Opus 5.5 | R$ 27,48 | 10 | R$ 0,19 | ~1.500 |
| Gemini 4 Argon | R$ 26,08 | 11 | R$ 0,19 | ~1.500 |
| Grok 4.7 | R$ 18,26 | 16 | R$ 0,08 | ~3.600 |
| Claude Sonnet 5.5 | R$ 15,60 | 19 | R$ 0,10 | ~3.000 |
| GPT-6.1 Sol | R$ 13,04 | 23 | R$ 0,10 | ~3.100 |
| Gemini 3.8 Flash | R$ 11,18 | 26 | R$ 0,08 | ~4.000 |
| Claude Haiku 5.5 | R$ 1,04 | 288 | R$ 0,01 | ~44.000 |

Mensagem para o cliente: **"use o modelo topo de linha para decidir e o intermediário para executar"**. O produto pode
sugerir isso automaticamente (roteamento inteligente, na fase 2), e isso é um diferencial que assinatura de fabricante
nenhum oferece.

## 4. Planos recomendados

| Plano | Preço/mês | Créditos inclusos | Modelos | Para quem |
|---|---|---|---|---|
| **Starter** | R$ 147 | R$ 80 | Econômico + Intermediário | Freelancer, uso leve |
| **Pro** | R$ 447 | R$ 300 | Todos | Dev profissional (sua faixa de referência de R$ 400–500) |
| **Max** | R$ 997 | R$ 720 | Todos | Quem usa agente o dia inteiro |
| **Equipe** | R$ 397 por assento (mín. 3) | R$ 260 por assento, num saldo único | Todos | Software houses e agências |
| **Enterprise / BYOK** | sob consulta (ex.: R$ 197 por assento) | — (usa a chave da própria empresa) | Todos | Quem já tem contrato com os provedores ou exige dados fora da plataforma |

**Recargas:** pacotes de R$ 100, R$ 300 e R$ 1.000 pelo mesmo preço de tabela, válidos por 12 meses, com recarga
automática opcional. **Créditos do plano expiram no fim do ciclo** (deixe isso claro nos termos). É a quebra
(*breakage*) que sustenta a margem dos planos.

**Teste grátis:** 7 dias com R$ 10 em créditos e **só modelos econômicos**. Modelo premium só com pagamento confirmado:
é a principal defesa contra fraude (gente criando contas para gastar Opus ou Fable de graça).

## 5. Margem por plano (lucro bruto por assinante)

Receita líquida = preço − 11% de impostos − 4% de gateway. Custo de API = créditos usados ÷ 1,5 (markup médio de 50%).

| Plano | 30% dos créditos usados | 60% | 100% (pior caso) |
|---|---|---|---|
| Starter (R$ 147) | R$ 88,95 (61%) | R$ 72,95 (50%) | R$ 51,62 (35%) |
| Pro (R$ 447) | R$ 299,95 (67%) | R$ 239,95 (54%) | R$ 159,95 (36%) |
| Max (R$ 997) | R$ 683,45 (69%) | R$ 539,45 (54%) | R$ 347,45 (35%) |
| Equipe (por assento) | R$ 265,45 (67%) | R$ 213,45 (54%) | R$ 144,12 (36%) |

Leitura: **mesmo se todo mundo gastar 100% dos créditos, a margem bruta fica em torno de 35%**; no uso típico (50–60%)
fica perto de 54%. Recargas têm margem menor (~18% depois de impostos), porque a margem principal está na assinatura.
Se quiser mais margem na recarga, suba o markup intermediário/avançado para 60% (a margem da recarga vai para ~22%).

Esses números aparecem ao vivo no painel do dono (Visão geral e Planos e margem) e mudam quando você altera preço,
câmbio, markup ou impostos.

## 6. Custos fixos e ponto de equilíbrio

| Item (lançamento) | Estimativa/mês |
|---|---|
| Vercel Pro (2 apps) | ~R$ 220 |
| Postgres gerenciado (Supabase Pro ou Neon, região SP) | ~R$ 140 |
| E-mail transacional, monitoramento de erros, domínio | ~R$ 150 |
| Sandboxes de agente (fase 2, por uso) | varia |
| **Total fixo inicial** | **~R$ 500–1.000** |

Com o Pro rendendo cerca de R$ 240 de lucro bruto no uso típico, **4 a 5 assinantes pagam a infraestrutura**. O resto paga
seu tempo e o marketing. Meta sugerida para os 3 primeiros meses: **30 assinantes pagantes (~R$ 13 mil de MRR)**.

## 7. Pontos para validar com o contador (antes de janeiro)

1. **Regime e CNAE.** SaaS costuma usar CNAE 6311-9/00 ou 6203-1/00. No Simples Nacional, Anexo III (a partir de 6%,
   com Fator R ≥ 28%) ou Anexo V (a partir de 15,5%). Os 11% do simulador são uma média conservadora.
2. **Reforma tributária:** em **2027 entra a CBS** (substitui PIS/Cofins), justamente no mês do lançamento. Planeje já
   com as regras de 2027.
3. **Importação de serviço:** pagar as APIs no exterior pode gerar IOF (3,5% no cartão internacional) e, dependendo da
   forma de pagamento, IRRF, CIDE, PIS/Cofins-Importação e ISS. O "sobrecusto" de 15% é configurável justamente para
   refletir o número real.
4. **Nota fiscal:** NFS-e a cada cobrança. O Asaas emite automaticamente.
5. **Câmbio:** use a PTAX com folga de 3% (o painel busca no Banco Central com um clique) e revise semanalmente. Se o real
   desvalorizar 10% e você não atualizar, a margem cai na mesma proporção.
