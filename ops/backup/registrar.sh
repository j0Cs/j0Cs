#!/usr/bin/env bash
# Grava o resultado do backup no banco da Forja (settings.backup_meta). A rotina diária lê esse
# registro e alerta o dono se o backup falhar ou parar de rodar.
# Uso: ORIGEM_URL=... bash ops/backup/registrar.sh <success|failure> <pasta de saída> [url da execução]
set -euo pipefail
: "${ORIGEM_URL:?defina ORIGEM_URL}"
STATUS="${1:?status}"
SAIDA="${2:?pasta}"
EXECUCAO="${3:-}"
OK=false
DETALHE="O backup ou a restauração de teste falhou. Veja o log da execução."
TABELAS=0
BYTES=0
if [ "$STATUS" = "success" ] && [ -f "$SAIDA/resumo.json" ]; then
  OK=true
  DETALHE="Cópia cifrada guardada e restauração de teste aprovada."
  TABELAS="$(sed -E 's/.*"tabelas": ([0-9]+).*/\1/' "$SAIDA/resumo.json")"
  BYTES="$(sed -E 's/.*"tamanhoBytes": ([0-9]+).*/\1/' "$SAIDA/resumo.json")"
fi
psql "$ORIGEM_URL" -qAt -v ON_ERROR_STOP=1 -v ok="$OK" -v detalhe="$DETALHE" -v execucao="$EXECUCAO" -v tabelas="$TABELAS" -v bytes="$BYTES" <<'SQL' >/dev/null
insert into settings (key, value, updated_at)
values ('backup_meta', jsonb_build_object(
  'em', now(), 'ok', :'ok'::boolean, 'detalhe', :'detalhe', 'execucao', nullif(:'execucao', ''),
  'tabelas', :'tabelas'::int, 'tamanhoBytes', :'bytes'::bigint), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
SQL
echo "Resultado registrado na Forja (ok=$OK)."
