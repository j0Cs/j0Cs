# 13. App desktop (macOS Intel e Apple Silicon, Windows)

Atualizado em **10/11/2026** (Sprint D1).

O app desktop é o **mesmo app web numa janela própria**, mais o que só dá para fazer na máquina do cliente: ler uma
pasta de projeto, instalar o time nos arquivos e ligar a telemetria das ferramentas com um clique. Fica em
`apps/desktop` (Electron).

O assistente de código do cliente (Claude Code, Codex, Gemini CLI) continua rodando por conta própria, com a assinatura
dele. O app **não dirige** essas ferramentas nem usa o login delas (doc 11, seção 1).

## 1. O que o app faz

| Recurso | Como funciona |
|---|---|
| Janela, menu e bandeja | Menu em português (Ir, Conta, Ajuda), atalhos Ctrl/Cmd+1 a 5 para as telas, ícone na bandeja com atalhos |
| Entrar pelo navegador | O app abre o navegador; a pessoa confirma com a conta que já está aberta lá; o app entra sem digitar senha |
| Link `forja://` | `forja://abrir/projetos` abre o app numa tela; `forja://entrar?…` é a volta do login |
| Pasta de projeto | "Este computador" → Abrir pasta: stack, linguagens, instruções de IA e varredura de segredos, sem GitHub |
| Instalar o time | Grava os arquivos do time na pasta (os mesmos do PR da Forja). `AGENTS.md` e `GEMINI.md` são preservados |
| Telemetria com um clique | Edita `~/.claude/settings.json`, `~/.codex/config.toml` e `~/.gemini/settings.json`, juntando ao que já existe |
| Atualização automática | Procura versão nova nos releases do GitHub ao abrir e a cada 6 horas |
| Sem conexão | Página local com "Tentar de novo" quando o servidor não responde |
| Microfone | Liberado só para a origem do app, para o modo call |

O que ficou para a Sprint D2: auditoria e revisão da branch local com o time (hoje a auditoria com IA exige o
repositório no GitHub), assinatura do Windows e Windows em ARM.

## 2. Segurança

| Regra | Onde |
|---|---|
| A janela só navega na origem do app. Outro endereço abre no navegador do sistema; `file:`, `javascript:` etc. são barrados | `src/navegacao.ts`, `src/main.ts` |
| A página roda isolada: sem Node, com `sandbox` e `contextIsolation`. Não há `<webview>` nem janelas novas | `src/main.ts` |
| `window.forjaDesktop` só existe na origem do app, e o processo principal confere a origem de novo em cada chamada | `src/preload.ts`, `src/ipc.ts` |
| Só pastas escolhidas pelo seletor do sistema podem ser lidas ou gravadas. Links simbólicos não são seguidos nem sobrescritos | `src/pasta.ts`, `src/time.ts` |
| Toda gravação pede confirmação numa janela nativa, com a lista do que muda. A página não desenha nem clica nessa janela | `src/ipc.ts` |
| A telemetria só aceita token no formato `fj_otlp_…` e o endereço embutido no app. O arquivo anterior vira `<arquivo>.forja-backup` | `src/telemetria.ts` |
| Arquivo de configuração que não é JSON válido, ou `otel` em formato inesperado, não é tocado | `src/telemetria.ts` |
| Permissões do navegador: só microfone, notificações e área de transferência, e só para a origem do app. Câmera é negada | `src/main.ts` |

**Login pelo navegador**, passo a passo:

1. O app sorteia um `estado` e abre `/desktop/autorizar?estado=…` no navegador.
2. A pessoa confirma. O servidor cria um código de uso único (3 minutos; o banco guarda só o SHA-256).
3. O navegador abre `forja://entrar?codigo=…&estado=…`.
4. O app só aceita o link se o `estado` for o que ele sorteou (10 minutos) e troca o código em
   `POST /api/desktop/sessao`, que exige o cabeçalho `x-forja-desktop` e tem limite por IP.

A sessão do app é separada da do navegador: sair de um não derruba o outro.

## 3. Rodar e testar

```bash
pnpm --filter @forja/desktop electron:instalar
```

```bash
FORJA_URL=http://localhost:3000 pnpm --filter @forja/desktop dev
```

```bash
pnpm --filter @forja/desktop test
```

```bash
pnpm --filter @forja/desktop test:app
```

- `electron:instalar` baixa o binário do Electron (o pnpm não roda esse passo sozinho). Só é preciso para rodar ou
  testar o app na máquina; o empacotamento baixa o dele.
- `test` são 28 testes unitários: navegação, links, mescla da telemetria nos três formatos, leitura de pasta e
  instalação do time.
- `test:app` abre o Electron de verdade contra o app web local (`next start` na porta 3000, conta demo) e passa por
  34 verificações: login pelo navegador de ponta a ponta, telemetria, pasta, time, navegação e página sem conexão.
  Sem tela, roda dentro do `xvfb-run` (o script já faz isso).
- `test:empacotado <executável>` é a fumaça do app já empacotado. Roda no CI em cada sistema.

## 4. Builds e publicação

O workflow `.github/workflows/desktop.yml`:

| Quando | O que faz |
|---|---|
| Pull request que mexe em `apps/desktop` | Testes, pacote de Linux com fumaça e instaladores de macOS e Windows como artefatos da execução (14 dias) |
| Tag `desktop-vX.Y.Z` | O mesmo, e publica os instaladores num release do GitHub |

Arquivos gerados: `Forja-mac-arm64.dmg`, `Forja-mac-x64.dmg`, `Forja-win-x64.exe`, os `.zip` do macOS e os
`latest*.yml` (usados pela atualização automática).

**Publicar uma versão:**

1. Suba a versão em `apps/desktop/package.json` (ex.: `0.1.1`) e faça o merge.
2. Crie a tag com o mesmo número:

```bash
git tag desktop-v0.1.1
```

```bash
git push origin desktop-v0.1.1
```

A página `/baixar` aponta para `releases/latest/download/…`, então passa a entregar a versão nova sozinha. Quem já tem
o app recebe pela atualização automática.

**Endereço embutido no instalador:** variável `FORJA_URL_DO_APP` no GitHub (Settings → Variables). Sem ela, o app abre
o endereço da Vercel. **Troque para o domínio próprio antes de distribuir**: os `*.vercel.app` pedem login da Vercel.

## 5. Assinatura

Sem assinatura o app funciona, mas o sistema avisa na primeira abertura (a página `/baixar` explica como abrir).

| Sistema | O que precisa | Onde cadastrar |
|---|---|---|
| macOS | Conta Apple Developer (US$ 99/ano), certificado "Developer ID Application" exportado em `.p12` e uma senha de app do Apple ID | Secrets do GitHub: `MAC_CERTIFICADO_P12_BASE64`, `MAC_CERTIFICADO_SENHA`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | Azure Trusted Signing (cerca de US$ 10/mês) ou certificado OV/EV | Entra na Sprint D2, quando a conta existir |

Com os secrets do macOS cadastrados, o workflow assina e notariza sozinho. **A atualização automática no macOS só
funciona com o app assinado**; no Windows funciona sem assinatura.

## 6. Limitações conhecidas

- **Repositório privado quebra o download e a atualização.** Os dois leem os releases públicos do GitHub. Se o
  repositório ficar privado (recomendado no doc 10), os instaladores precisam ir para um repositório público só de
  releases ou para um armazenamento próprio. É uma troca de configuração em `electron-builder.yml` e na variável
  `NEXT_PUBLIC_DESKTOP_DOWNLOADS` do app web.
- **macOS e Windows foram testados só no CI** (o app abre e passa na fumaça). Menu, bandeja, notificações e o link
  `forja://` nesses sistemas precisam de um teste manual numa máquina de verdade.
- **Grok Build** não entra na telemetria com um clique: ele lê a configuração de variáveis de ambiente do terminal.
- Arquivo de configuração com comentários (o Gemini CLI aceita) é tratado como ilegível, e o app pede para colar à mão.

## 7. Pendências do dono

- [ ] Testar o instalador num Mac (Apple Silicon ou Intel) e num Windows.
- [ ] Conta Apple Developer e os cinco secrets do macOS.
- [ ] Assinatura do Windows (Azure Trusted Signing).
- [ ] Domínio próprio e a variável `FORJA_URL_DO_APP`.
- [ ] Decidir onde ficam os instaladores se o repositório virar privado.
