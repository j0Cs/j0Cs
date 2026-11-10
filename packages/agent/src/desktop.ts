/**
 * Contrato entre o app web e o app desktop (window.forjaDesktop). Só tipos: o desktop implementa no
 * preload e o web usa quando roda dentro do app. Tudo o que grava em disco pede confirmação numa
 * janela nativa do sistema antes de gravar.
 */
import type { EstruturaDoRepositorio } from "./estrutura";
import type { FerramentaDoTime } from "./personas";
import type { Achado } from "./varredura";

export interface PastaLocal {
  id: string;
  nome: string;
  caminho: string;
}

export interface AnaliseDaPasta extends PastaLocal {
  estrutura: EstruturaDoRepositorio;
  achados: Achado[];
  /** Arquivos que chamam APIs de modelos de IA. */
  chamadasDeIa: string[];
  /** true quando a lista veio do git (só arquivos versionados); false quando a pasta não é um repositório. */
  versionada: boolean;
  /** A pasta passou do limite de arquivos ou de tamanho e a leitura parou antes do fim. */
  truncada: boolean;
}

export interface ArquivoPlanejado {
  caminho: string;
  estado: "novo" | "muda" | "igual";
}

export type FerramentaDeTelemetria = "claude_code" | "codex" | "gemini_cli";

export interface SituacaoDaTelemetria {
  ferramenta: FerramentaDeTelemetria;
  arquivo: string;
  /** nao_configurada: sem telemetria; forja: já manda para a Forja; outro: manda para outro endereço. */
  situacao: "nao_configurada" | "forja" | "outro";
  /** O arquivo existe mas não pôde ser lido como JSON/TOML: o app não mexe nele. */
  ilegivel: boolean;
}

export interface PreviaDaTelemetria {
  arquivo: string;
  existe: boolean;
  /** Uma linha por chave que muda, com o token mascarado. */
  mudancas: string[];
  erro?: string;
}

export interface ResultadoDeGravacao {
  ok: boolean;
  /** A pessoa fechou a confirmação sem aceitar. */
  cancelado?: boolean;
  erro?: string;
  arquivos?: string[];
  copiaDeSeguranca?: string | null;
}

export interface SituacaoDaAtualizacao {
  versao: string;
  estado: "desligada" | "em_dia" | "verificando" | "baixando" | "pronta" | "erro";
  novaVersao?: string;
  detalhe?: string;
}

export interface ForjaDesktop {
  info(): Promise<{ versao: string; sistema: "mac" | "windows" | "linux"; processador: string; computador: string }>;
  entrarPeloNavegador(): Promise<void>;
  notificar(aviso: { titulo: string; corpo: string; caminho?: string }): Promise<void>;
  pastas: {
    escolher(): Promise<AnaliseDaPasta | null>;
    recentes(): Promise<PastaLocal[]>;
    analisar(id: string): Promise<AnaliseDaPasta | { erro: string }>;
    mostrar(id: string): Promise<void>;
  };
  time: {
    previa(id: string, ferramentas: FerramentaDoTime[]): Promise<ArquivoPlanejado[] | { erro: string }>;
    instalar(id: string, ferramentas: FerramentaDoTime[]): Promise<ResultadoDeGravacao>;
  };
  telemetria: {
    situacao(): Promise<SituacaoDaTelemetria[]>;
    previa(ferramenta: FerramentaDeTelemetria, token: string): Promise<PreviaDaTelemetria>;
    aplicar(ferramenta: FerramentaDeTelemetria, token: string): Promise<ResultadoDeGravacao>;
  };
  atualizacao: {
    situacao(): Promise<SituacaoDaAtualizacao>;
    verificar(): Promise<SituacaoDaAtualizacao>;
    instalar(): Promise<void>;
  };
}
