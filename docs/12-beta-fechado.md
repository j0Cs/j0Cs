# 12. Beta fechado: convites de fundador, primeiros passos, métricas, status e suporte

Atualizado em **10/11/2026** (Sprint 5).

## Convites de fundador

No painel do dono, em **Convites de fundador**:

1. Preencha para quem é o convite, os dias de teste, os créditos do teste, quantas empresas podem usar e a validade.
2. Se quiser desconto na assinatura, informe o valor por mês e por quantos meses. O painel cria o cupom no Stripe
   (precisa do Stripe configurado, doc 8). Também dá para colar o código de um cupom já criado.
3. Copie o link da tabela (`/cadastro?fundador=CÓDIGO`) e mande para a empresa.

O que acontece do lado do convidado:

- A tela de cadastro mostra o convite: para quem é, os dias, os créditos e o texto da oferta.
- Ao criar a conta, a empresa já nasce com os dias e os créditos do convite. Um uso do convite é consumido na mesma
  transação, então dois cadastros simultâneos não passam do limite.
- Na hora de assinar, o cupom entra sozinho no checkout. Quem não tem convite continua podendo digitar um código
  promocional.
- Convite revogado, vencido ou esgotado: a pessoa vê o aviso e pode criar a conta com o teste normal (7 dias, R$ 10).

Exemplo da oferta do roadmap: desconto de R$ 150 por 6 meses faz o Pro de R$ 447 sair por R$ 297.

Pendência: definir `WEB_URL` no projeto `forja-admin` da Vercel, para os links saírem completos na tabela.

## Primeiros passos

Em **Projetos**, a conta nova vê um guia com quatro passos: confirmar o e-mail, criar o primeiro projeto, fazer o
primeiro pedido e conectar o GitHub. O próximo passo aparece com o botão de ação. O guia some quando os quatro estão
feitos; assinar um plano aparece como lembrete enquanto durar o teste.

## Métricas do beta

No painel do dono, em **Métricas do beta** (últimos 30 dias):

| Bloco | O que mostra |
|---|---|
| Indicadores | Empresas ativas na semana (meta: 10), contas com a primeira resposta em até 10 minutos, parte do contexto que veio do cache e clientes com margem negativa (meta: nenhum) |
| Funil | Das contas novas: criaram a conta → confirmaram o e-mail → tiveram a primeira resposta → assinaram |
| Modelos mais usados | Pedidos, tokens, valor cobrado e margem por modelo |
| Uso e margem por cliente | Créditos usados, margem, último uso, plano e a marca "fundador" |

A margem usa o câmbio e o sobrecusto atuais do painel. Só respostas concluídas entram nas contas.

## Status e suporte

- **`/status`** (público): situação do aplicativo, do banco e de cada provedor de IA. A situação dos provedores vem da
  taxa de erro dos pedidos da última hora: abaixo de 10% operando, de 10% a 50% instável, acima disso fora do ar.
  Com menos de 5 pedidos na hora, aparece "sem uso na última hora". A página mostra só contagens, nenhum dado de cliente.
- **`/suporte`** (público): WhatsApp e e-mail, com o horário de atendimento e o que mandar para agilizar. Os canais vêm
  das variáveis `SUPORTE_EMAIL` e `SUPORTE_WHATSAPP` (só dígitos, com 55 na frente) do projeto `forja-web`. Sem elas,
  a página avisa que os canais estão sendo configurados.
- O app tem o link "Ajuda e suporte" na barra lateral, e o site tem Status e Suporte no rodapé.

## Testes

```bash
pnpm --filter @forja/billing test:integracao
```

Cobre o cupom de fundador, o convite (válido, vencido, inexistente e dois cadastros ao mesmo tempo), o checkout com e
sem cupom e as métricas, com Postgres local e Stripe simulado. No app rodando: status, suporte, cadastro com convite
válido e inválido, saldo do convite e o guia de primeiros passos avançando.

## Pendências do dono

- [ ] Lista de convidados e a oferta de fundador (valor do desconto e meses).
- [ ] `SUPORTE_EMAIL` e `SUPORTE_WHATSAPP` na Vercel (`forja-web`) e `WEB_URL` no `forja-admin`.
- [ ] Stripe configurado, para o desconto do convite valer na assinatura.
