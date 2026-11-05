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

## Personalidade e voz do Hefesto

- **Jeito de falar** (`PERSONA_HEFESTO` em `apps/web/lib/persona.ts`, usado no chat da call e nas instruções do
  GPT-Live): um mestre artesão experiente, calmo, firme e caloroso, sem pressa, com o humor seco de quem vive na
  oficina. Fala português do dia a dia, reage ao que ouve e usa frases curtas. Não fala de deuses nem de mitologia; se
  perguntarem, diz com naturalidade que é a inteligência artificial (o engenheiro) da Forja.
- **Voz natural (GPT-Live)**: a pessoa escolhe entre as duas vozes em português, **Bossa** e **Tempo**; as instruções
  pedem tom grave, ritmo calmo e pausas naturais. É a experiência parecida com o modo de voz do ChatGPT.
- **Voz do navegador**: prefere vozes masculinas naturais (no Edge, "Microsoft Antonio Online (Natural)"), um pouco
  mais grave e mais lenta, com seletor e botão "Ouvir" na sala de espera. No Chrome só existe a voz do Google (a mesma
  do Google Tradutor); a sala avisa e sugere o Edge ou a voz natural.

## Segurança e cobrança da voz em nuvem

```
navegador ──SDP──► /api/call/voz/sessao ──(nossa chave)──► OpenAI /v1/live/sessions
    │                                                           │
    │◄────────────── áudio WebRTC direto ───────────────────────┘
    │
    ├─ a cada 15 s: /api/call/voz/pulso  → cobra os segundos; saldo < 1 minuto → desliga
    ├─ delegação: /api/chat (modo call)  → modelo escolhido, cobrado por token
    └─ fim: /api/call/voz/fim            → cobra até agora e desliga

Desligar = servidor conecta no canal lateral wss://…/live/sessions/{id}/attach, envia session.close e espera
session.closed (com os segundos que a OpenAI cobrou); se não vier, tenta o endpoint REST de hangup. No fim normal
quem desliga é o servidor: o navegador só manda session.close pelo canal de dados se /fim falhar. Um 404
do REST só conta como "já encerrada" se o canal lateral nem chegou a abrir e a chave ainda é aceita pela
OpenAI; se o canal abriu e não fechou, a sessão estava viva e a varredura tenta de novo.

Varredura (varrerSessoes): Vercel Cron (1/min no Pro; 1/dia no Hobby) e também a cada pulso e abertura de call
(no máximo uma a cada 20 s). Cada call tem limite de 60 minutos.
    ├─ "active" sem pulso há 30 s     → cobra até o último pulso + 90 s, no máximo, e desliga
    ├─ "connecting" parada há 2 min   → reserva órfã, libera
    └─ "closing" (desligar falhou)    → tenta de novo; não cobra mais nada do cliente
```

- A chave da OpenAI **nunca** vai ao navegador: quem cria a sessão é o servidor.
- O navegador só pode mandar uma lista fechada de eventos pelo canal de dados (`allowed_client_events`).
- A cobrança usa o relógio do servidor, não o que o navegador informa; um "claim" no banco impede cobrança dupla
  entre o pulso e a varredura.
- **Uma call aberta por pessoa** (índice único no banco) e saldo para 2 minutos de voz para abrir.
- Quando pedimos o fim, a cobrança do cliente para ali (`ended_at`). Se o desligamento no provedor falhar, o tempo
  extra é custo da plataforma. A call é fechada mesmo assim, com alerta `critical` no log, para não prender o
  usuário, quando: passaram 10 minutos tentando, a chave que abriu a call foi apagada, ou a OpenAI recusou a chave.
  Por isso o painel não deixa apagar uma chave com call em andamento: desative e apague depois.
- **Conexão**: o navegador gera o id da reserva e manda junto no pedido. Sair da sala ou fechar a aba durante
  "Conectando…" fecha a sessão sem cobrar, mesmo antes de o servidor responder. Se o WebRTC não chegar a "connected"
  em 15 s (redes que bloqueiam UDP), a call cai em erro, sem cobrança. Depois de conectada, a cobrança conta desde a
  criação da sessão no provedor (inclui os poucos segundos de conexão), com o primeiro pulso enviado na hora.
  Quedas curtas de rede (até 10 s) não derrubam a call.
- **Isenção por falha de conexão**: o aviso vem do navegador, então vale no máximo 3 vezes por hora por pessoa; depois
  disso a call é cobrada normalmente. Abrir call também tem limite (20 por hora por pessoa).
- **Interrupções**: falar por cima do Hefesto (ou parar uma resposta no chat) não cancela o modelo. A resposta termina
  no servidor, fica salva na conversa (na ordem certa, logo depois da pergunta) e é cobrada pelo uso real do provedor. Cancelar no meio exigiria estimar tokens
  de raciocínio e de cache, que não aparecem no texto, e cobraria abaixo do custo.
- `CRON_SECRET` precisa estar definido no projeto `forja-web` da Vercel (a Vercel o envia na varredura). O cron só roda
  em deploys de **produção**; em prévias de PR, a proteção fica por conta do pulso e do desligamento por queda de conexão.

## O que ainda precisa de uma chave real para validar

O GPT-Live é recente (GA em 10/09/2026). A criação da sessão, o pulso, o corte por saldo, o fim pelo canal lateral, a
varredura e o cancelamento no meio da conexão foram testados com um servidor que imita a OpenAI. Os nomes dos eventos do canal de dados (legendas, delegação,
encerramento) seguem a documentação de 04/11/2026 e estão concentrados em `components/oficina/voz-nuvem.ts`
(`EVENTOS`). No primeiro teste com a chave real, confira: delegação → resposta falada, legendas em pt-BR e
qualidade da voz `bossa` com nomes e números, e se o `session.close` pelo canal lateral derruba a call do
navegador na hora. Todo desligamento vai para o log: "call desligada" (`via: sideband`, com os segundos do provedor,
ou `via: hangup`), "call dada como desligada sem confirmação" (aviso) ou "desligamento não confirmado" (erro).
