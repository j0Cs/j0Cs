import { gzipSync } from "node:zlib";

/** Monta um .tar.gz como o do GitHub (pasta raiz + cabeçalho pax para nome longo). */
export function tarGz(arquivos: Record<string, string | Buffer>, raiz = "dono-repo-abc123") {
  const blocos: Buffer[] = [];
  const cabecalho = (nome: string, tamanho: number, tipo: string) => {
    const h = Buffer.alloc(512);
    h.write(nome.slice(0, 99), 0, "utf8");
    h.write("0000644\0", 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(tamanho.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write(tipo, 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    let soma = 0;
    for (const b of h) soma += b;
    h.write(soma.toString(8).padStart(6, "0") + "\0 ", 148);
    return h;
  };
  const dados = (b: Buffer) => [b, Buffer.alloc((512 - (b.length % 512)) % 512)];
  blocos.push(cabecalho(`${raiz}/`, 0, "5"));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const b = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo);
    const completo = `${raiz}/${nome}`;
    if (completo.length > 99) {
      const reg = ` path=${completo}\n`;
      let len = reg.length + 2;
      if (String(len).length + reg.length !== len) len = String(len + 1).length + reg.length;
      const pax = Buffer.from(`${len}${reg}`);
      blocos.push(cabecalho("PaxHeader", pax.length, "x"), ...dados(pax));
    }
    blocos.push(cabecalho(completo, b.length, "0"), ...dados(b));
  }
  blocos.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocos));
}
