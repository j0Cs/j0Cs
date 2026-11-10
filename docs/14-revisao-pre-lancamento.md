# 14. Revisão pré-lançamento: e-mail, preços em duas linhas, Minhas IAs, boas-vindas e site

Atualizado em **10/11/2026**, depois do primeiro teste do dono na versão publicada.

## 1. E-mail

**Causa do problema:** nenhum e-mail saía em produção. O envio usa o Microsoft 365 (doc 5), que nunca foi configurado,
e o botão "Reenviar e-mail" falhava sem avisar. O mesmo valia para recuperação de senha, convites e avisos de cobrança.

O que mudou:

- O botão "Reenviar e-mail" responde na tela: enviado, limite atingido ou envio fora do ar.
- O painel do dono mostra um aviso vermelho enquanto nenhum e-mail sai.
- As credenciais podem ficar nos **Secrets das Edge Functions do Supabase**, como as outras chaves:

| Secret | O que é |
|---|---|
| `MS_TENANT_ID` | ID do diretório (tenant) do Microsoft 365 |
| `MS_CLIENT_ID` | ID do aplicativo registrado no Entra |
| `MS_CLIENT_SECRET` | Segredo do aplicativo |
| `EMAIL_FROM` | Caixa remetente (ex.: `nao-responda@seudominio.com.br`) |

O passo a passo do registro do aplicativo está no doc 5. Depois de cadastrar, vale em até 2 minutos, sem deploy.
**Enquanto isso não for feito, nenhuma conta nova consegue confirmar o e-mail.**

## 2. Preços em duas linhas

| Linha | Plano | Preço | Créditos por mês | Para quem |
|---|---|---|---|---|
| Gestão | Gestão | R$ 59 | R$ 15 | Uma pessoa que já paga Claude, ChatGPT, Gemini ou Grok |
| Gestão | Gestão Equipe | R$ 49 por assento (mín. 3) | R$ 15 por assento | Equipes que usam as próprias contas |
| Construir com a Forja | Starter | R$ 197 (era R$ 147) | R$ 80 | Começar a construir com os nossos modelos |
| Construir com a Forja | Pro | R$ 597 (era R$ 447) | R$ 300 | Todos os modelos, projetos ilimitados |
| Construir com a Forja | Max | R$ 1.297 (era R$ 997) | R$ 720 | Uso de agente o dia inteiro |
| Construir com a Forja | Equipe | R$ 497 por assento (era R$ 397) | R$ 260 por assento | Equipes que constroem com a Forja |

- Na **Gestão** os tokens da construção são da conta do cliente. Os créditos cobrem só a auditoria e a revisão de QA,
  que rodam nos modelos da Forja.
- O **agente que escreve código** (tarefa nova e "corrigir achados") só existe na linha de construção.
- Os valores são uma proposta. Ajuste em **Painel do dono → Planos e margem**, sem deploy. A migração `0010` só
  reajustou os preços que ainda estavam no valor padrão antigo.

## 3. Minhas IAs

A tela "Assistentes de IA" virou **Minhas IAs**, o segundo item do menu:

- um cartão por conta (Claude, ChatGPT, Gemini e Grok), com a situação da conexão e o gasto da API;
- o atalho para ligar com um clique pelo app desktop;
- "Usa outra IA?" para pedir DeepSeek, Mistral, Cursor, Copilot e outras;
- a explicação de por que não existe "Entrar com o ChatGPT" (os termos das três empresas proíbem; doc 11, seção 1).

"Conecte uma conta de IA" também entrou no guia de primeiros passos.

**O que ainda não existe:** leitura de uso de DeepSeek, Mistral, Cursor, Copilot e Windsurf, e o uso da chave de API do
próprio cliente dentro do chat da Forja (BYOK). Os dois estão no roadmap.

## 4. Cadastro, boas-vindas e segurança

Depois de criar a conta, a pessoa passa por **quatro etapas** (`/boas-vindas`):

1. **Sua empresa**: CNPJ ou CPF (dígitos conferidos, inclusive o CNPJ com letras), telefone e tamanho da equipe.
   Obrigatória: o app não abre antes. O mesmo documento não abre uma segunda conta, o que barra teste grátis repetido.
2. **Como vai usar**: com as próprias contas de IA, com a Forja construindo, ou os dois.
3. **Segurança**: verificação em duas etapas com app autenticador (pode ficar para depois).
4. **Seus números**: onde ler o saldo de créditos, os tokens das IAs e as recomendações.

A verificação em duas etapas do cliente fica em **Segurança da conta** (`/conta/seguranca`), com QR code e códigos de
backup. No login, a conta protegida pede o código depois da senha.

**Cartão no cadastro: ainda não.** Depende do Stripe configurado (doc 8). Quando houver, a etapa de pagamento entra
entre a 2 e a 3.

## 5. Site

- Abertura nova: "Suas IAs, uma só oficina", com um painel animado que alterna entre as duas formas de usar.
- Faixa rolante, revelação ao rolar, régua de têmpera que aquece ao entrar na tela e cartões que reagem ao ponteiro.
- Seções novas: duas formas de usar (com o preço inicial de cada linha), app para computador e **Quem faz a Forja**.
- **Rampin Technology**: assinatura "um produto Rampin Technology" na abertura, no rodapé e nas páginas públicas,
  com a marca e o link para `rampintechnology.com.br`.
- Com "reduzir movimento" ligado no sistema, nada anima. Sem JavaScript, todo o conteúdo aparece.

## 6. Testes

- 189 testes unitários (9 novos: CPF, CNPJ, telefone e as duas linhas de plano).
- Integração da cobrança, do agente e dos assistentes com os preços novos.
- Roteiro no navegador com 16 verificações: preços, cadastro, boas-vindas, CNPJ repetido, duas etapas no cadastro e no
  login, Minhas IAs e a resposta do botão de e-mail.
- Site conferido em computador e celular, com movimento reduzido e sem JavaScript.

## 7. Pendências do dono

- [ ] Registrar o aplicativo no Microsoft 365 e cadastrar os quatro secrets (seção 1). **É o que destrava o cadastro.**
- [ ] Conferir os preços das duas linhas.
- [ ] Stripe, para cobrar e para pedir cartão no cadastro.
- [ ] Conferir o texto sobre a Rampin Technology na seção "Quem faz a Forja".
