# 8. Cobrança com o Stripe

Assinatura dos planos (cartão ou boleto), recarga avulsa (Pix ou cartão), portal do cliente, inadimplência e painel do
dono. Código em `packages/billing`; telas em `/plano`, `/precos` (pública) e **Cobrança** no painel.

## Como funciona

| Situação | O que acontece |
|---|---|
| Teste grátis | 7 dias, R$ 10 em créditos, só modelos econômicos. Acabou: o uso é bloqueado **na hora** (os dados ficam) e a rotina diária manda um e-mail |
| Assina (cartão ou boleto) | Stripe Checkout em português. Quando a 1ª fatura é paga: plano em vigor, créditos do plano entram e o que sobrou do teste expira |
| Renovação paga | Os créditos do plano que sobraram no ciclo **expiram** e entram os do novo ciclo. Créditos de recarga não expiram na renovação |
| Troca para cima (ou mais assentos) | Vale na hora; o Stripe cobra a diferença proporcional e os créditos seguem a mesma proporção. Sem pagamento, nada muda (`pending_if_incomplete`) |
| Troca para baixo | Vale na renovação, sem reembolso. Voltar ao plano já pago antes da renovação não cobra de novo |
| Recarga | R$ 100, R$ 300 ou R$ 1.000 por Pix (QR válido por 1 h) ou cartão; o crédito entra quando o pagamento confirma. Só para assinantes |
| Renovação recusada | E-mail ao dono com o motivo em português e o link da fatura; **3 dias de carência**; depois o uso é pausado (dados mantidos). Pagou: reativa na hora |
| Cancelamento | Pelo portal, no fim do período pago. Encerrada a assinatura: sem plano, uso bloqueado, créditos do plano expiram, recargas ficam guardadas |
| Reembolso | Pelo painel (Cobrança): total ou parcial, cartão ou Pix. Os créditos são estornados na mesma proporção, sem deixar o saldo negativo. **Boleto não tem reembolso pelo Stripe** |
| Saldo baixo | E-mail aos donos e administradores com 20% e com 5% dos créditos do plano (um por nível; volta a valer quando entram créditos) |

Detalhes que garantem que ninguém paga em dobro nem ganha crédito de graça:

- **Webhook idempotente**: cada evento é gravado em `stripe_events` na mesma transação dos efeitos. Repetido, não faz
  nada; falhou no meio, nada fica gravado e o Stripe tenta de novo. Além disso, cada crédito tem referência única
  (fatura, recarga, reembolso), então dois eventos diferentes da mesma fatura também não duplicam.
- **Fora de ordem**: o webhook relê a assinatura no Stripe antes de aplicar, e só a fatura mais recente muda o plano.
- **Créditos da fatura** = créditos do plano × (valor da linha ÷ preço unitário). Cupom não reduz créditos (a conta usa o
  valor antes do desconto).
- **Preços no Stripe** são criados sozinhos: produto `forja_plan_<plano>` e um preço por valor (`lookup_key` com o
  valor). Mudou o preço no painel, quem já assina continua no preço antigo; assinaturas novas usam o novo.
- Bloqueios (teste vencido, sem plano, inadimplência, suspensão manual) usam uma regra só (`bloqueioDaOrg`), no chat, na
  voz e nas telas.

## O que você configura no Stripe (modo de teste primeiro)

1. **Chaves**: Developers → API keys → *Secret key* (`sk_test_...`). Na Vercel, em **forja-web e forja-admin**, crie
   `STRIPE_SECRET_KEY` como **Secret**, só em Production. O painel usa a chave para reembolsar.
2. **Meios de pagamento**: Settings → Payment methods → ligue **Cards**, **Boleto** e **Pix**. O Pix no Brasil pode
   precisar de aprovação da Stripe. Até ser aprovado, a recarga fica só no cartão.
3. **Webhook**: Developers → Webhooks → *Add endpoint*:
   - URL: `https://<domínio do app>/api/stripe/webhook`.
   - **Enquanto não houver domínio próprio**, a Vercel Authentication bloqueia o Stripe nos endereços `.vercel.app`.
     Em forja-web → Settings → Deployment Protection → *Protection Bypass for Automation*, gere o segredo e use
     `https://forja-web-rampin-tech.vercel.app/api/stripe/webhook?x-vercel-protection-bypass=<segredo>`. Com domínio
     próprio, o parâmetro não é mais necessário.
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
     `invoice.payment_action_required`, `charge.refunded`.
   - Copie o *Signing secret* (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` no **forja-web** (Secret, Production).
4. **Portal do cliente**: Settings → Billing → Customer portal:
   - Ligue: atualizar meio de pagamento, histórico de faturas, cancelar assinatura **no fim do período**.
   - **Desligue** a troca de plano: ela é feita no app, que aplica as regras de crédito e de assentos.
   - Informe os links de termos e de privacidade quando estiverem prontos.
5. **Recuperação de pagamento**: Settings → Billing → Subscriptions and emails → *Smart Retries* (sugestão: 4
   tentativas em até 2 semanas). Ao esgotar, **cancele a assinatura**. A Forja pausa o uso depois de 3 dias, e o
   pagamento reativa na hora.
6. **Faça um Redeploy** dos dois projetos depois de cadastrar as variáveis.

Sem `STRIPE_SECRET_KEY`, as telas mostram "pagamentos online ainda não estão ligados" e nada quebra.

## Teste do "pronto quando" no modo de teste

1. Crie uma conta no app (teste grátis) e assine o **Pro** com o cartão `4242 4242 4242 4242` (qualquer validade
   futura e CVC). Confira em Plano e cobrança: plano Pro e R$ 300 em créditos.
2. Recarregue R$ 100 por **Pix** (no modo de teste o Stripe mostra um botão para simular o pagamento).
3. Recusa na renovação: no Stripe, abra o cliente, troque o cartão padrão por `4000 0000 0000 0341` (aceita
   cadastrar, recusa a cobrança) e avance o relógio com um *test clock*, ou crie a assinatura já num test clock. Você
   recebe o e-mail; depois de 3 dias o uso pausa. Pague a fatura pelo link e veja reativar.
4. Cancele pelo portal (**Abrir o portal** em Plano e cobrança).
5. Confira tudo em **Cobrança** no painel do dono.

## Testes automáticos

- `pnpm --filter @forja/billing test`: regras de crédito, status, assentos e saldo.
- `pnpm --filter @forja/billing test:integracao`: Postgres local de verdade, SDK oficial do Stripe e um Stripe
  simulado (`test-integracao/stripe-simulado.ts`). Percorre o cenário inteiro acima com webhooks repetidos e fora de
  ordem. Cria e apaga o banco `forja_teste_cobranca` e só roda com `DATABASE_URL` local.

## Ainda não feito

- **NFS-e** a cada cobrança (NFE.io ou outro emissor com o padrão nacional): depende do CNPJ e do contador (doc 3, §7).
- Validade de 12 meses das recargas e recarga automática (doc 3): as recargas hoje não expiram.
- Contestação (`charge.dispute.created`): por enquanto, trate pelo painel do Stripe e suspenda o cliente à mão se for
  fraude.
- Termos de uso e política de privacidade (a Sprint 2 prevê o rascunho).
