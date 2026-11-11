#!/usr/bin/env bash
# Datenbank-Tests.
#   Ohne Docker:  supabase/local/run-tests.sh            (eigener Postgres + Supabase-Nachbau)
#   Mit Supabase: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/local/run-tests.sh
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SB="$ROOT/supabase"
if [ -z "${DB_URL:-}" ]; then
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  DATA="$(mktemp -d)"; SOCK="$(mktemp -d)"; PORT="${PGPORT:-55432}"
  RUNAS=""; [ "$(id -u)" = "0" ] && { chown -R postgres "$DATA" "$SOCK"; RUNAS="sudo -u postgres"; }
  trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT
  $RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
  $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -p $PORT -c fsync=off -c max_connections=200" -w start >/dev/null
  DB_URL="postgresql://postgres@/postgres?host=$SOCK&port=$PORT"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$SB/local/supabase-stub.sql"
  for f in "$SB"/migrations/*.sql; do psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$SB/catalog.sql"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$SB/seed.sql"
fi
fail=0
export DB_URL
for t in "$SB"/tests/*.sql "$SB"/tests/*.sh; do
  [ -e "$t" ] || continue
  if [[ "$t" == *.sql ]]; then run=(psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$t"); else run=(bash "$t"); fi
  if out=$("${run[@]}" 2>&1); then echo "OK    $(basename "$t")  $(echo "$out" | grep -v '^$' | tail -1 | grep -v ERROR || true)"; else echo "FAIL  $(basename "$t")"; echo "$out" | grep -E "ERROR|FEHLER|ASSERT|DETAIL" | head -5; fail=1; fi
done
[ -n "${KEEP_DB:-}" ] && { echo "DB läuft weiter: $DB_URL"; read -r _; }
exit $fail
