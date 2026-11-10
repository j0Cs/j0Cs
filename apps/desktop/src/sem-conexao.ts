/** Página local mostrada quando o app web não carrega (sem internet ou servidor fora do ar). */
export function paginaSemConexao(base: string, motivo: string) {
  const seguro = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Forja</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html,body{height:100%;margin:0;background:#060a12;color:#cbd3df;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100%;display:grid;place-content:center;padding:32px;max-width:34rem;margin:auto}
h1{font-size:28px;letter-spacing:.04em;text-transform:uppercase;margin:0 0 12px;color:#f2f5f9}
p{margin:0 0 20px;color:#9aa6b8}
a{display:inline-block;background:#ff6a1a;color:#160a02;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:4px}
a:focus-visible{outline:2px solid #ffb36b;outline-offset:3px}
small{display:block;margin-top:24px;color:#5d6b80;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
</style></head><body><main>
<h1>Sem conexão com a Forja</h1>
<p>Não consegui abrir o app. Confira a internet e tente de novo. O que está no seu computador continua intacto.</p>
<p><a href="${seguro(base)}/central">Tentar de novo</a></p>
<small>${seguro(motivo.slice(0, 80))}</small>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
