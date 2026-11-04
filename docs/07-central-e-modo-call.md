# 7. Central de comando e modo call

## A experiência

Depois do login, a pessoa cai na **Central** (`/central`): tela cheia, fundo de aço azulado e, no centro, o **Núcleo**,
anéis com as cores que o aço ganha quando é temperado (palha, bronze, roxo-pavão, azul) em volta de um metal
incandescente que esquenta com a voz. É a identidade visual da Forja, original de propósito: não usa nada da Marvel
(nome, HUD ou "reator"), que seria risco de marca num produto comercial.

Dali saem os dois modos:

| Modo | O que acontece |
|---|---|
| **Entrar na call** | Sala de reunião por voz com **Hefesto** (o deus grego da forja, que construía autômatos). Ele pergunta, debate e monta a **especificação viva** enquanto vocês falam; no fim, um clique transforma a especificação em projeto. |
| **Escrever** | O pedido digitado abre (ou cria) um projeto e já é enviado ao chat, onde a pessoa escolhe o modelo. |

O nome do agente pode ser trocado com `NEXT_PUBLIC_ASSISTANT_NAME`.

## Duas vozes

| | Voz natural (nuvem) | Voz do navegador |
|---|---|---|
| Tecnologia | OpenAI **GPT-Live** (`gpt-live-1`) via WebRTC | Web Speech API do navegador |
| Conversa | Full-duplex: ouve enquanto fala, dá para interromper | Um fala de cada vez (botão "Interromper") |
| "Cérebro" | Delega o raciocínio ao **modelo escolhido** (Claude, GPT, Gemini…) pelo nosso gateway | O mesmo: o texto vai ao modelo escolhido |
| Custo de voz | US$ 0,05/min (≈ **R$ 0,47/min** ao cliente com o markup padrão), por segundo, silêncio incluído | Zero |
| Quando usar | Padrão para clientes pagantes | Teste grátis, demonstração, navegadores sem suporte à nuvem |
| Privacidade | Áudio processado pela OpenAI | No Chrome, o áudio vai para os servidores do Google |

A voz natural só aparece quando há uma chave da OpenAI ativa em **Chaves de API** no painel do dono.

## Segurança e cobrança da voz em nuvem

```
navegador ──SDP──► /api/call/voz/sessao ──(nossa chave)──► OpenAI /v1/live/sessions
    │                                                           │
    │◄────────────── áudio WebRTC direto ───────────────────────┘
    │
    ├─ a cada 15 s: /api/call/voz/pulso  → cobra os segundos; saldo < 1 minuto → desliga (hangup)
    ├─ delegação: /api/chat (modo call)  → modelo escolhido, cobrado por token
    └─ fim: /api/call/voz/fim            → cobra até agora e desliga

Vercel Cron (1/min): /api/cron/voz → chamadas sem pulso há 60 s são cobradas até o último pulso + 15 s e desligadas
```

- A chave da OpenAI **nunca** vai ao navegador: quem cria a sessão é o servidor.
- O navegador só pode mandar uma lista fechada de eventos pelo canal de dados (`allowed_client_events`).
- A cobrança usa o relógio do servidor, não o que o navegador informa; um "claim" no banco impede cobrança dupla
  entre o pulso e a varredura.
- Para abrir a call é preciso saldo para 2 minutos de voz.
- `CRON_SECRET` precisa estar definido no projeto `forja-web` da Vercel (a Vercel o envia na varredura). O cron só roda
  em deploys de **produção**; em prévias de PR, a proteção fica por conta do pulso e do desligamento por queda de conexão.

## O que ainda precisa de uma chave real para validar

O GPT-Live é recente (GA em 10/09/2026). A criação da sessão, o pulso, o corte por saldo, o fim e a varredura foram
testados com um servidor que imita a OpenAI. Os nomes dos eventos do canal de dados (legendas, delegação,
encerramento) seguem a documentação de 04/11/2026 e estão concentrados em `components/oficina/voz-nuvem.ts`
(`EVENTOS`). No primeiro teste com a chave real, confira: delegação → resposta falada, legendas em pt-BR e
qualidade da voz `bossa` com nomes e números.
