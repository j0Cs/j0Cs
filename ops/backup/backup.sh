#!/usr/bin/env bash
# Backup diário da Forja (roda no GitHub Actions, .github/workflows/backup.yml):
#   1. pg_dump do banco de produção (schemas public e drizzle);
#   2. restauração de teste num Postgres separado;
#   3. conferência: as mesmas tabelas, com as mesmas quantidades de linhas (tolerância para o que
#      mudou entre a cópia e a contagem) e as tabelas principais presentes;
#   4. cópia cifrada com age para a chave pública do dono (só ele abre).
#
# Uso: ORIGEM_URL=... DESTINO_TESTE_URL=postgres://u:s@host:5432/postgres AGE_RECIPIENT=age1... \
#        bash ops/backup/backup.sh <pasta de saída>
# DESTINO_TESTE_URL aponta para um servidor descartável (o banco de teste é criado e apagado lá).
# Nada de dados nem de contagens vai para o log: o repositório é público.
set -euo pipefail

SAIDA="${1:?informe a pasta de saída}"
: "${ORIGEM_URL:?defina ORIGEM_URL}" "${DESTINO_TESTE_URL:?defina DESTINO_TESTE_URL}" "${AGE_RECIPIENT:?defina AGE_RECIPIENT}"
case "$AGE_RECIPIENT" in age1*) ;; *) echo "AGE_RECIPIENT precisa ser uma chave pública do age (age1...)."; exit 1 ;; esac

umask 077
mkdir -p "$SAIDA"
DIA="$(date -u +%Y-%m-%d)"
DUMP="$SAIDA/forja-$DIA.dump"
TESTE="forja_restauracao_$(date -u +%Y%m%d%H%M%S)"
SERVIDOR_TESTE="${DESTINO_TESTE_URL%/*}"
DESTINO="$SERVIDOR_TESTE/$TESTE"

limpar() {
  rm -f "$DUMP" "$SAIDA/origem.tsv" "$SAIDA/restaurado.tsv"
  psql "$DESTINO_TESTE_URL" -qAt -c "drop database if exists $TESTE with (force)" >/dev/null 2>&1 || true
}
trap limpar EXIT

CONTAGEM="select table_schema || '.' || table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE' order by 1"

# Sessões e códigos de verificação não vão para a cópia (são tokens de login: uma cópia vazada não
# deve permitir entrar na conta de ninguém). Depois de uma restauração, todos entram de novo.
SEM_DADOS="public.sessions public.verifications"

echo "1/4 Copiando o banco (pg_dump)…"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --no-publications --no-subscriptions \
  --schema=public --schema=drizzle \
  --exclude-table-data=public.sessions --exclude-table-data=public.verifications \
  --file="$DUMP" "$ORIGEM_URL"
psql "$ORIGEM_URL" -qAt -F $'\t' -c "$CONTAGEM" > "$SAIDA/origem.tsv"
for t in $SEM_DADOS; do sed -i "s/^$t\t.*/$t\t0/" "$SAIDA/origem.tsv"; done

echo "2/4 Restaurando num banco separado…"
psql "$DESTINO_TESTE_URL" -qAt -c "create database $TESTE" >/dev/null
# --clean recria o schema public do banco novo; --exit-on-error: qualquer erro reprova o backup
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$DESTINO" "$DUMP"
psql "$DESTINO" -qAt -F $'\t' -c "$CONTAGEM" > "$SAIDA/restaurado.tsv"

echo "3/4 Conferindo a restauração…"
TABELAS="$(wc -l < "$SAIDA/origem.tsv" | tr -d ' ')"
if ! diff <(cut -f1 "$SAIDA/origem.tsv") <(cut -f1 "$SAIDA/restaurado.tsv") >/dev/null; then
  echo "Reprovado: as tabelas restauradas não são as mesmas da origem."
  exit 1
fi
# diferença aceita por tabela: 20 linhas ou 2% (o banco segue recebendo dados durante a cópia)
if ! awk -F'\t' 'NR==FNR { o[$1]=$2; next } {
    d = $2 - o[$1]; if (d < 0) d = -d; lim = o[$1] * 0.02; if (lim < 20) lim = 20;
    if (d > lim) { ruins++ } }
    END { exit ruins > 0 }' "$SAIDA/origem.tsv" "$SAIDA/restaurado.tsv"; then
  echo "Reprovado: há tabela com quantidade de linhas diferente da origem."
  exit 1
fi
for t in public.organizations public.users public.plans public.models public.credit_ledger drizzle.__drizzle_migrations; do
  grep -q "^$t"$'\t' "$SAIDA/restaurado.tsv" || { echo "Reprovado: falta a tabela $t."; exit 1; }
done
MIGRACOES="$(psql "$DESTINO" -qAt -c "select count(*) from drizzle.__drizzle_migrations")"
[ "$MIGRACOES" -gt 0 ] || { echo "Reprovado: histórico de migrações vazio."; exit 1; }
echo "   $TABELAS tabelas conferidas; restauração aprovada."

echo "4/4 Cifrando com a chave pública do dono (age)…"
age --recipient "$AGE_RECIPIENT" --output "$DUMP.age" "$DUMP"
(cd "$SAIDA" && sha256sum "forja-$DIA.dump.age" > "forja-$DIA.dump.age.sha256")
BYTES="$(stat -c %s "$DUMP.age")"
printf '{"tabelas": %s, "tamanhoBytes": %s, "arquivo": "forja-%s.dump.age"}\n' "$TABELAS" "$BYTES" "$DIA" > "$SAIDA/resumo.json"
echo "Pronto: forja-$DIA.dump.age"
