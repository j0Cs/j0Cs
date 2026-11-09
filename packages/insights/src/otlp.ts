/**
 * Leitura de lotes de logs do OpenTelemetry (OTLP/HTTP), em JSON e em protobuf. Só o necessário para
 * os eventos de requisição dos assistentes: nome do evento, atributos do registro e do recurso e o
 * horário. Métricas e traces são aceitos pela rota e descartados (os eventos já trazem os tokens).
 *
 * Números de campo: opentelemetry-proto (collector/logs/v1, logs/v1, common/v1, resource/v1).
 */
import { gunzipSync } from "node:zlib";

export type ValorOtlp = string | number | boolean | null;

export interface RegistroOtlp {
  /** Nome do evento: event_name, o atributo event.name ou o corpo (texto), nesta ordem. */
  nomes: string[];
  atributos: Record<string, ValorOtlp>;
  recurso: Record<string, ValorOtlp>;
  tempoMs: number | null;
}

export class ErroOtlp extends Error {}

export const LIMITE_DO_LOTE = 5_000_000;

/** Corpo cru → bytes (descompacta gzip quando o exportador manda Content-Encoding: gzip). */
export function corpoDoLote(buf: Buffer, encoding: string | null) {
  if (buf.length > LIMITE_DO_LOTE) throw new ErroOtlp("Lote grande demais.");
  if (encoding && /gzip/i.test(encoding)) {
    try {
      return gunzipSync(buf, { maxOutputLength: LIMITE_DO_LOTE * 4 });
    } catch {
      throw new ErroOtlp("Lote compactado inválido.");
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// JSON (OTLP/HTTP json): int64 vem como texto; chaves em camelCase
// ---------------------------------------------------------------------------

type AnyValueJson = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean };
type KeyValueJson = { key?: string; value?: AnyValueJson };

function valorJson(v: AnyValueJson | undefined): ValorOtlp {
  if (!v) return null;
  if (v.stringValue !== undefined) return String(v.stringValue);
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.boolValue !== undefined) return Boolean(v.boolValue);
  return null;
}

function atributosJson(lista: KeyValueJson[] | undefined) {
  const r: Record<string, ValorOtlp> = {};
  for (const kv of lista ?? []) if (kv.key) r[kv.key] = valorJson(kv.value);
  return r;
}

export function lerLogsJson(texto: string): RegistroOtlp[] {
  let corpo: { resourceLogs?: { resource?: { attributes?: KeyValueJson[] }; scopeLogs?: { logRecords?: Record<string, unknown>[] }[] }[] };
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroOtlp("JSON inválido.");
  }
  const registros: RegistroOtlp[] = [];
  for (const rl of corpo.resourceLogs ?? []) {
    const recurso = atributosJson(rl.resource?.attributes);
    for (const sl of rl.scopeLogs ?? []) {
      for (const lr of sl.logRecords ?? []) {
        const atributos = atributosJson(lr.attributes as KeyValueJson[]);
        const corpoTexto = valorJson(lr.body as AnyValueJson);
        const tempo = Number(lr.timeUnixNano ?? lr.observedTimeUnixNano ?? 0);
        registros.push({
          nomes: [lr.eventName, atributos["event.name"], corpoTexto].filter((x): x is string => typeof x === "string" && x.length > 0),
          atributos,
          recurso,
          tempoMs: tempo > 0 ? Math.floor(tempo / 1e6) : null,
        });
      }
    }
  }
  return registros;
}

// ---------------------------------------------------------------------------
// Protobuf (OTLP/HTTP binary): leitor mínimo do formato de fio
// ---------------------------------------------------------------------------

class Leitor {
  pos = 0;
  constructor(private readonly b: Buffer) {}
  get fim() {
    return this.pos >= this.b.length;
  }
  varint(): bigint {
    let r = 0n;
    let s = 0n;
    for (;;) {
      if (this.pos >= this.b.length) throw new ErroOtlp("Protobuf truncado.");
      const byte = this.b[this.pos++]!;
      r |= BigInt(byte & 0x7f) << s;
      if (!(byte & 0x80)) return r;
      s += 7n;
      if (s > 70n) throw new ErroOtlp("Varint inválido.");
    }
  }
  bytes(): Buffer {
    const n = Number(this.varint());
    if (n < 0 || this.pos + n > this.b.length) throw new ErroOtlp("Protobuf truncado.");
    const r = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return r;
  }
  fixed64(): Buffer {
    if (this.pos + 8 > this.b.length) throw new ErroOtlp("Protobuf truncado.");
    const r = this.b.subarray(this.pos, this.pos + 8);
    this.pos += 8;
    return r;
  }
  pular(tipo: number) {
    if (tipo === 0) this.varint();
    else if (tipo === 1) this.pos += 8;
    else if (tipo === 2) this.bytes();
    else if (tipo === 5) this.pos += 4;
    else throw new ErroOtlp(`Tipo de campo ${tipo} não suportado.`);
  }
  /** Percorre os campos chamando fn(numero, tipo); fn devolve false para pular o valor. */
  campos(fn: (n: number, tipo: number) => boolean) {
    while (!this.fim) {
      const chave = Number(this.varint());
      const n = chave >>> 3;
      const tipo = chave & 7;
      if (!fn(n, tipo)) this.pular(tipo);
    }
  }
}

/** AnyValue: 1 string, 2 bool, 3 int64, 4 double (5 array, 6 kvlist, 7 bytes: ignorados). */
function valorPb(b: Buffer): ValorOtlp {
  const l = new Leitor(b);
  let v: ValorOtlp = null;
  l.campos((n, tipo) => {
    if (n === 1 && tipo === 2) v = l.bytes().toString("utf8");
    else if (n === 2 && tipo === 0) v = l.varint() !== 0n;
    else if (n === 3 && tipo === 0) v = Number(BigInt.asIntN(64, l.varint()));
    else if (n === 4 && tipo === 1) v = l.fixed64().readDoubleLE(0);
    else return false;
    return true;
  });
  return v;
}

/** KeyValue: 1 key, 2 value (AnyValue). */
function chaveValorPb(b: Buffer, destino: Record<string, ValorOtlp>) {
  const l = new Leitor(b);
  let chave = "";
  let valor: ValorOtlp = null;
  l.campos((n, tipo) => {
    if (n === 1 && tipo === 2) chave = l.bytes().toString("utf8");
    else if (n === 2 && tipo === 2) valor = valorPb(l.bytes());
    else return false;
    return true;
  });
  if (chave) destino[chave] = valor;
}

/** Resource: 1 attributes (KeyValue). */
function recursoPb(b: Buffer) {
  const r: Record<string, ValorOtlp> = {};
  const l = new Leitor(b);
  l.campos((n, tipo) => {
    if (n === 1 && tipo === 2) chaveValorPb(l.bytes(), r);
    else return false;
    return true;
  });
  return r;
}

/** LogRecord: 1 time_unix_nano, 11 observed_time, 5 body, 6 attributes, 12 event_name. */
function registroPb(b: Buffer, recurso: Record<string, ValorOtlp>): RegistroOtlp {
  const l = new Leitor(b);
  const atributos: Record<string, ValorOtlp> = {};
  let tempo = 0n;
  let observado = 0n;
  let corpo: ValorOtlp = null;
  let evento = "";
  l.campos((n, tipo) => {
    if (n === 1 && tipo === 1) tempo = l.fixed64().readBigUInt64LE(0);
    else if (n === 11 && tipo === 1) observado = l.fixed64().readBigUInt64LE(0);
    else if (n === 5 && tipo === 2) corpo = valorPb(l.bytes());
    else if (n === 6 && tipo === 2) chaveValorPb(l.bytes(), atributos);
    else if (n === 12 && tipo === 2) evento = l.bytes().toString("utf8");
    else return false;
    return true;
  });
  const ns = tempo || observado;
  return {
    nomes: [evento, atributos["event.name"], corpo].filter((x): x is string => typeof x === "string" && x.length > 0),
    atributos,
    recurso,
    tempoMs: ns > 0n ? Number(ns / 1_000_000n) : null,
  };
}

/** ExportLogsServiceRequest: 1 resource_logs → ResourceLogs: 1 resource, 2 scope_logs → ScopeLogs: 2 log_records. */
export function lerLogsProtobuf(buf: Buffer): RegistroOtlp[] {
  const registros: RegistroOtlp[] = [];
  const raiz = new Leitor(buf);
  raiz.campos((n, tipo) => {
    if (n !== 1 || tipo !== 2) return false;
    const rlBuf = raiz.bytes();
    let recurso: Record<string, ValorOtlp> = {};
    const escopos: Buffer[] = [];
    const rl = new Leitor(rlBuf);
    rl.campos((m, t) => {
      if (m === 1 && t === 2) recurso = recursoPb(rl.bytes());
      else if (m === 2 && t === 2) escopos.push(rl.bytes());
      else return false;
      return true;
    });
    for (const e of escopos) {
      const sl = new Leitor(e);
      sl.campos((m, t) => {
        if (m === 2 && t === 2) registros.push(registroPb(sl.bytes(), recurso));
        else return false;
        return true;
      });
    }
    return true;
  });
  return registros;
}

export function lerLogs(corpo: Buffer, contentType: string | null): RegistroOtlp[] {
  const tipo = (contentType ?? "").toLowerCase();
  if (tipo.includes("json")) return lerLogsJson(corpo.toString("utf8"));
  if (tipo.includes("protobuf") || tipo.includes("octet-stream") || !tipo) return lerLogsProtobuf(corpo);
  throw new ErroOtlp(`Tipo de conteúdo não suportado: ${contentType}.`);
}
