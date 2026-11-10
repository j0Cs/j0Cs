import type { AgentToolCall, AgentToolDef } from "@forja/core/server";
import { CaminhoInvalido, normalizarCaminho, type Workspace } from "./workspace";

/**
 * Ferramentas do agente v1: só leem e alteram a cópia de trabalho. Nada roda no servidor (sem
 * comandos, sem rede): o único efeito no mundo é o PR, que a pessoa aprova antes de abrir.
 */
export const FERRAMENTAS: AgentToolDef[] = [
  {
    name: "listar_arquivos",
    description: "Lista os arquivos do repositório (até 400). Use 'pasta' para ver só uma parte.",
    inputSchema: {
      type: "object",
      properties: { pasta: { type: "string", description: "Pasta relativa à raiz, ex.: src/app. Vazio = tudo." } },
    },
  },
  {
    name: "ler_arquivo",
    description: "Lê um arquivo de texto com as linhas numeradas. Para arquivos longos, leia por partes.",
    inputSchema: {
      type: "object",
      properties: {
        caminho: { type: "string" },
        linha_inicial: { type: "integer", minimum: 1 },
        linha_final: { type: "integer", minimum: 1 },
      },
      required: ["caminho"],
    },
  },
  {
    name: "buscar",
    description: "Procura um texto ou expressão regular em todos os arquivos de texto. Devolve arquivo:linha: trecho.",
    inputSchema: {
      type: "object",
      properties: {
        padrao: { type: "string", description: "Texto ou regex (JavaScript), sem diferenciar maiúsculas." },
        pasta: { type: "string" },
      },
      required: ["padrao"],
    },
  },
  {
    name: "escrever_arquivo",
    description: "Cria ou substitui um arquivo inteiro com o conteúdo dado.",
    inputSchema: {
      type: "object",
      properties: { caminho: { type: "string" }, conteudo: { type: "string" } },
      required: ["caminho", "conteudo"],
    },
  },
  {
    name: "editar_arquivo",
    description: "Troca um trecho exato de um arquivo por outro. O trecho precisa aparecer uma única vez.",
    inputSchema: {
      type: "object",
      properties: { caminho: { type: "string" }, procurar: { type: "string" }, substituir: { type: "string" } },
      required: ["caminho", "procurar", "substituir"],
    },
  },
  {
    name: "apagar_arquivo",
    description: "Apaga um arquivo.",
    inputSchema: { type: "object", properties: { caminho: { type: "string" } }, required: ["caminho"] },
  },
  {
    name: "concluir",
    description: "Termina a tarefa. Chame quando as mudanças estiverem completas e revisadas.",
    inputSchema: {
      type: "object",
      properties: {
        titulo_pr: { type: "string", description: "Título curto do pull request, em português." },
        resumo: { type: "string", description: "O que foi feito e como testar, em português, para a descrição do PR." },
      },
      required: ["titulo_pr", "resumo"],
    },
  },
];

const MAX_SAIDA = 30_000;
const corta = (s: string) => (s.length > MAX_SAIDA ? `${s.slice(0, MAX_SAIDA)}\n… (cortado: ${s.length - MAX_SAIDA} caracteres a mais)` : s);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const MAX_ESCRITA = 400_000;

export interface ResultadoDaFerramenta {
  output: string;
  isError: boolean;
  /** caminho alterado (para gravar a mudança) */
  alterou?: string;
  /** linha curta para a tela ao vivo */
  resumo: string;
}

export function executarFerramenta(ws: Workspace, chamada: AgentToolCall): ResultadoDaFerramenta {
  const a = chamada.input ?? {};
  try {
    switch (chamada.name) {
      case "listar_arquivos": {
        const pasta = str(a.pasta) ? normalizarCaminho(a.pasta) : "";
        const todos = ws.listar(pasta);
        const lista = todos.slice(0, 400);
        const extra = todos.length > lista.length ? `\n… e mais ${todos.length - lista.length} arquivos. Liste uma pasta específica.` : "";
        return {
          output: lista.length ? lista.join("\n") + extra : "(nenhum arquivo)",
          isError: false,
          resumo: `Listou ${todos.length} arquivo(s)${pasta ? ` em ${pasta}` : ""}`,
        };
      }
      case "ler_arquivo": {
        const caminho = normalizarCaminho(a.caminho);
        const conteudo = ws.ler(caminho);
        if (conteudo === null) return { output: `${caminho} não existe.`, isError: true, resumo: `Tentou ler ${caminho} (não existe)` };
        const linhas = conteudo.split("\n");
        const ini = Math.max(1, Number(a.linha_inicial) || 1);
        const fim = Math.min(linhas.length, Number(a.linha_final) || Math.min(linhas.length, ini + 799));
        const trecho = linhas
          .slice(ini - 1, fim)
          .map((l, i) => `${String(ini + i).padStart(5)}  ${l}`)
          .join("\n");
        const resto = fim < linhas.length ? `\n… (${linhas.length} linhas no total; leia a partir da ${fim + 1})` : "";
        return { output: corta(trecho + resto), isError: false, resumo: `Leu ${caminho}${ini > 1 || fim < linhas.length ? ` (linhas ${ini}–${fim})` : ""}` };
      }
      case "buscar": {
        const padrao = str(a.padrao);
        if (!padrao) return { output: "Informe o padrão.", isError: true, resumo: "Busca sem padrão" };
        let re: RegExp;
        try {
          re = new RegExp(padrao, "i");
        } catch {
          re = new RegExp(padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
        const pasta = str(a.pasta) ? normalizarCaminho(a.pasta) : "";
        const achados: string[] = [];
        for (const caminho of ws.listar(pasta)) {
          let conteudo: string | null;
          try {
            conteudo = ws.ler(caminho);
          } catch {
            continue; // binário ou grande
          }
          if (!conteudo) continue;
          const linhas = conteudo.split("\n");
          for (let i = 0; i < linhas.length && achados.length < 150; i++) {
            if (re.test(linhas[i]!)) achados.push(`${caminho}:${i + 1}: ${linhas[i]!.trim().slice(0, 200)}`);
          }
          if (achados.length >= 150) break;
        }
        return {
          output: achados.length ? corta(achados.join("\n")) : "Nada encontrado.",
          isError: false,
          resumo: `Buscou "${padrao.slice(0, 60)}": ${achados.length}${achados.length >= 150 ? "+" : ""} ocorrência(s)`,
        };
      }
      case "escrever_arquivo": {
        const caminho = normalizarCaminho(a.caminho);
        const conteudo = str(a.conteudo);
        if (conteudo.length > MAX_ESCRITA) return { output: "Arquivo grande demais (limite de 400 mil caracteres).", isError: true, resumo: `Arquivo grande demais: ${caminho}` };
        const existia = ws.existe(caminho);
        ws.escrever(caminho, conteudo);
        return {
          output: `${existia ? "Atualizado" : "Criado"}: ${caminho} (${conteudo.split("\n").length} linhas).`,
          isError: false,
          alterou: caminho,
          resumo: `${existia ? "Reescreveu" : "Criou"} ${caminho}`,
        };
      }
      case "editar_arquivo": {
        const caminho = normalizarCaminho(a.caminho);
        const procurar = str(a.procurar);
        const atual = ws.ler(caminho);
        if (atual === null) return { output: `${caminho} não existe. Use escrever_arquivo para criar.`, isError: true, resumo: `Editar ${caminho}: não existe` };
        if (!procurar) return { output: "Informe o trecho a procurar.", isError: true, resumo: `Editar ${caminho}: trecho vazio` };
        const vezes = atual.split(procurar).length - 1;
        if (vezes !== 1) {
          return {
            output: vezes === 0 ? "Trecho não encontrado. Leia o arquivo e copie o trecho exato." : `O trecho aparece ${vezes} vezes; inclua mais contexto para ficar único.`,
            isError: true,
            resumo: `Editar ${caminho}: trecho ${vezes === 0 ? "não encontrado" : "repetido"}`,
          };
        }
        ws.escrever(caminho, atual.replace(procurar, () => str(a.substituir)));
        return { output: `Editado: ${caminho}.`, isError: false, alterou: caminho, resumo: `Editou ${caminho}` };
      }
      case "apagar_arquivo": {
        const caminho = normalizarCaminho(a.caminho);
        if (!ws.existe(caminho)) return { output: `${caminho} não existe.`, isError: true, resumo: `Apagar ${caminho}: não existe` };
        ws.apagar(caminho);
        return { output: `Apagado: ${caminho}.`, isError: false, alterou: caminho, resumo: `Apagou ${caminho}` };
      }
      default:
        return { output: `Ferramenta desconhecida: ${chamada.name}.`, isError: true, resumo: `Ferramenta desconhecida: ${chamada.name}` };
    }
  } catch (e) {
    if (e instanceof CaminhoInvalido) return { output: e.message, isError: true, resumo: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Auditoria: só leitura, mais registrar achados e concluir com um relatório
// ---------------------------------------------------------------------------

const SO_LEITURA = new Set(["listar_arquivos", "ler_arquivo", "buscar"]);

export const FERRAMENTAS_DE_AUDITORIA: AgentToolDef[] = [
  ...FERRAMENTAS.filter((f) => SO_LEITURA.has(f.name)),
  {
    name: "registrar_achado",
    description:
      "Registra um problema ou oportunidade de melhoria encontrado no projeto. Um achado por chamada, com arquivo e linha quando houver. Não repita achados da varredura automática.",
    inputSchema: {
      type: "object",
      properties: {
        categoria: { type: "string", enum: ["seguranca", "estrutura", "qualidade", "desempenho", "economia"] },
        severidade: { type: "string", enum: ["critica", "alta", "media", "baixa", "info"] },
        titulo: { type: "string", description: "Curto e específico, em português." },
        detalhe: { type: "string", description: "O que está errado ou pode melhorar e por que importa (cenário concreto)." },
        arquivo: { type: "string", description: "Caminho do arquivo, se houver." },
        linha: { type: "integer", minimum: 1 },
        recomendacao: { type: "string", description: "O que fazer, de forma prática." },
        persona: { type: "string", enum: ["dev_senior", "dev_pleno", "qa_pleno", "seguranca_pleno"], description: "Papel do time que encontrou." },
      },
      required: ["categoria", "severidade", "titulo", "detalhe", "recomendacao"],
    },
  },
  {
    name: "concluir_auditoria",
    description: "Termina a análise com um resumo executivo, o parecer de cada papel do time, uma nota de 0 a 10 por categoria e, em revisão de pull request, o veredito.",
    inputSchema: {
      type: "object",
      properties: {
        resumo: { type: "string", description: "Resumo em português: estado geral, os 3 a 5 pontos mais importantes e por onde começar." },
        notas: {
          type: "object",
          properties: {
            seguranca: { type: "integer", minimum: 0, maximum: 10 },
            estrutura: { type: "integer", minimum: 0, maximum: 10 },
            qualidade: { type: "integer", minimum: 0, maximum: 10 },
            desempenho: { type: "integer", minimum: 0, maximum: 10 },
            economia: { type: "integer", minimum: 0, maximum: 10 },
          },
        },
        pareceres: {
          type: "array",
          description: "Um parecer curto por papel do time (o que ele viu de mais importante e o que recomenda primeiro).",
          items: {
            type: "object",
            properties: {
              persona: { type: "string", enum: ["dev_senior", "dev_pleno", "qa_pleno", "seguranca_pleno"] },
              parecer: { type: "string" },
            },
            required: ["persona", "parecer"],
          },
        },
        veredito: { type: "string", enum: ["pode_seguir", "seguir_com_ajustes", "nao_seguir"], description: "Só em revisão de pull request." },
      },
      required: ["resumo"],
    },
  },
];

export const ferramentaDeLeitura = (nome: string) => SO_LEITURA.has(nome);
