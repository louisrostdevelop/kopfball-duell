#!/usr/bin/env bash
# Lokale Datenbank für die Entwicklung starten (ohne Docker): Postgres + Supabase-Nachbau + Migrationen + Katalog.
#   supabase/local/start-db.sh [ordner=/var/tmp/kopfball-dev] [port=55440]   -> gibt die Verbindungs-URL aus
# Beim zweiten Aufruf wird die vorhandene Datenbank weiterbenutzt und nur aktualisiert (Migrationen sind wiederholbar).
# Stoppen: supabase/local/start-db.sh stop [ordner]
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
SB="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
RUNAS=""; [ "$(id -u)" = "0" ] && RUNAS="sudo -u postgres"
if [ "${1:-}" = "stop" ]; then $RUNAS "$PGBIN/pg_ctl" -D "${2:-/var/tmp/kopfball-dev}/data" -m fast stop >/dev/null 2>&1 || true; exit 0; fi
DIR="${1:-/var/tmp/kopfball-dev}"; PORT="${2:-55440}"; DATA="$DIR/data"; SOCK="$DIR/sock"
mkdir -p "$DATA" "$SOCK"; [ -n "$RUNAS" ] && chown -R postgres "$DIR"
NEW=0; [ -f "$DATA/PG_VERSION" ] || { $RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null; NEW=1; }
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1 || $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -l "$DIR/log" -o "-k $SOCK -p $PORT -c listen_addresses=''" -w start >/dev/null
URL="postgresql://postgres@/postgres?host=$SOCK&port=$PORT"
[ "$NEW" = 1 ] && psql "$URL" -q -v ON_ERROR_STOP=1 -f "$SB/local/supabase-stub.sql"
for f in "$SB"/migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$SB/catalog.sql"
psql "$URL" -q -v ON_ERROR_STOP=1 -f "$SB/seed.sql"
echo "$URL"
