/**
 * O que a pessoa cola na própria máquina para a ferramenta mandar o uso à Forja. Só eventos de
 * requisição: nenhuma configuração aqui liga o envio de prompts ou respostas.
 */
import type { Ferramenta } from "./ferramentas";

export interface Configuracao {
  arquivo: string;
  linguagem: "json" | "toml" | "bash";
  conteudo: string;
  observacao: string;
}

export function configuracao(tool: Ferramenta, base: string, token: string): Configuracao {
  const raiz = `${base.replace(/\/+$/, "")}/api/otlp`;
  switch (tool) {
    case "claude_code":
      return {
        arquivo: "~/.claude/settings.json",
        linguagem: "json",
        conteudo: JSON.stringify(
          {
            env: {
              CLAUDE_CODE_ENABLE_TELEMETRY: "1",
              OTEL_LOGS_EXPORTER: "otlp",
              OTEL_METRICS_EXPORTER: "none",
              OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
              OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${raiz}/v1/logs`,
              OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer ${token}`,
            },
          },
          null,
          2,
        ),
        observacao:
          "Se o arquivo já tem um bloco \"env\", junte estas chaves a ele. Vale para as próximas sessões (feche e abra o Claude Code). Prompts e respostas não são enviados.",
      };
    case "codex":
      return {
        arquivo: "~/.codex/config.toml",
        linguagem: "toml",
        conteudo: `[otel]
environment = "forja"
log_user_prompt = false
exporter = { otlp-http = { endpoint = "${raiz}/v1/logs", protocol = "json", headers = { "authorization" = "Bearer ${token}" } } }`,
        observacao: "Tem que ser o config.toml da sua pasta pessoal: o de um projeto não liga a telemetria. Reinicie o Codex depois.",
      };
    case "gemini_cli":
      return {
        arquivo: "~/.gemini/settings.json",
        linguagem: "json",
        conteudo: JSON.stringify(
          {
            telemetry: {
              enabled: true,
              target: "local",
              otlpEndpoint: raiz,
              otlpProtocol: "http",
              otlpHeaders: `authorization=Bearer ${token}`,
              logPrompts: false,
            },
          },
          null,
          2,
        ),
        observacao: "logPrompts: false impede o envio dos seus prompts (o padrão do Gemini CLI é enviar). Reinicie o Gemini CLI depois.",
      };
    case "grok_build":
      return {
        arquivo: "~/.zshrc ou ~/.bashrc",
        linguagem: "bash",
        conteudo: `export GROK_EXTERNAL_OTEL=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=${raiz}
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${token}"`,
        observacao: "O Grok Build lê o cabeçalho só de variável de ambiente. Abra um terminal novo depois de salvar.",
      };
  }
}
