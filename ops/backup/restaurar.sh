#!/usr/bin/env bash
# Restaura uma cópia do backup num banco Postgres (para recuperar dados ou para o teste mensal).
# Uso: bash ops/backup/restaurar.sh <forja-AAAA-MM-DD.dump.age> <arquivo com a chave privada> <URL do banco de destino>
# Recusa um destino que já tenha tabelas no schema public (use FORCAR=1 só se tiver certeza).
set -euo pipefail
ARQUIVO="${1:?arquivo .dump.age}"
CHAVE="${2:?arquivo da chave privada (AGE-SECRET-KEY-...)}"
DESTINO="${3:?URL do banco de destino}"

if [ -f "$ARQUIVO.sha256" ]; then (cd "$(dirname "$ARQUIVO")" && sha256sum -c "$(basename "$ARQUIVO").sha256" >/dev/null) || { echo "O arquivo não confere com o .sha256."; exit 1; }; fi
TABELAS="$(psql "$DESTINO" -qAt -c "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$TABELAS" != "0" ] && [ "${FORCAR:-}" != "1" ]; then
  echo "O banco de destino já tem $TABELAS tabela(s) em public. Restaure num banco vazio (ou use FORCAR=1)."
  exit 1
fi

umask 077
TEMP="$(mktemp)"
trap 'rm -f "$TEMP"' EXIT
age --decrypt --identity "$CHAVE" --output "$TEMP" "$ARQUIVO"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$DESTINO" "$TEMP"
echo "Restaurado: $(psql "$DESTINO" -qAt -c "select count(*) from information_schema.tables where table_schema = 'public'") tabelas em public."
