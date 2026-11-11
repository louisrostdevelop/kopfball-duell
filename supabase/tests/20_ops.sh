#!/usr/bin/env bash
# Betrieb: neue Saison anlegen; Sicherung und Wiederherstellung in eine leere Datenbank ergeben denselben Stand.
set -euo pipefail
OPS="$(cd "$(dirname "$0")/../ops" && pwd)"; SB="$(dirname "$OPS")"
q() { psql "$1" -qtAX -v ON_ERROR_STOP=1 -c "$2"; }
fail() { echo "ASSERT: $1"; exit 1; }

# Neue Saison: schließt an die letzte an, zweimal hintereinander = zwei aufeinanderfolgende Saisons
R=$(psql "$DB_URL" -qtAX -v ON_ERROR_STOP=1 <<SQL
begin;
\i $OPS/new-season.sql
\i $OPS/new-season.sql
select count(*) = 0 from game.seasons a join game.seasons b on a.id < b.id and a.ends_at > b.starts_at;
rollback;
SQL
)
[ "$(echo "$R" | tail -1)" = "t" ] || fail "Saisons überlappen"

# Sicherung + Wiederherstellung nur auf dem lokalen Nachbau (auf echtem Supabase kann man keine zweite Datenbank mit auth anlegen)
[ "$(q "$DB_URL" "select count(*) from pg_roles where rolname = 'supabase_admin'")" = "0" ] || { echo "Sicherung übersprungen (echtes Supabase)"; exit 0; }
TAG="ops$(date +%s%N)"; T="restore_$TAG"; W="$(mktemp -d)"
trap 'q "$DB_URL" "drop database if exists $T" >/dev/null 2>&1; q "$DB_URL" "delete from auth.users where email like '"'"'$TAG%'"'"'" >/dev/null; rm -rf "$W"' EXIT
# Testdaten: Spieler mit Buchungen, Kopf, Wertung, Bestenliste
U=$(q "$DB_URL" "insert into auth.users (id, email, is_anonymous) values (gen_random_uuid(), '$TAG-a', false) returning id")
q "$DB_URL" "select game.book('$U', 'coins', 777, 'test'), game.give_item('$U', 'head:rocco', 'test')" >/dev/null
q "$DB_URL" "insert into game.scores (board, period, player_id, score) values ('endless', 'all', '$U', 42)"
SRC=$(echo "$DB_URL" | sed "s#/postgres?#/postgres?#")
DST=$(echo "$DB_URL" | sed "s#/postgres?#/$T?#")
q "$DB_URL" "create database $T"
psql "$DST" -q -v ON_ERROR_STOP=1 -f "$SB/local/supabase-stub.sql" 2>/dev/null || psql "$DST" -q -f "$SB/local/supabase-stub.sql" >/dev/null 2>&1 || true
for f in "$SB"/migrations/*.sql; do psql "$DST" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DST" -q -v ON_ERROR_STOP=1 -f "$SB/catalog.sql"
psql "$DST" -q -v ON_ERROR_STOP=1 -f "$OPS/new-season.sql"
BACKUP_UNENCRYPTED=1 SUPABASE_DB_URL="$SRC" bash "$OPS/backup.sh" "$W" >/dev/null
SUPABASE_DB_URL="$DST" bash "$OPS/restore.sh" "$W"/*.sql.gz >/dev/null
SUPABASE_DB_URL="$DST" bash "$OPS/restore.sh" "$W"/*.sql.gz >/dev/null 2>&1 && fail "zweites Einspielen hätte verweigert werden müssen"
check="select (select count(*) from game.players) || '/' || (select coalesce(sum(coins),0) || ':' || coalesce(sum(gems),0) from game.wallets) || '/' ||
  (select count(*) from game.ledger) || '/' || (select count(*) from game.inventory) || '/' || (select count(*) from game.seasons) || '/' ||
  (select count(*) from game.scores)"
A=$(q "$DB_URL" "$check"); B=$(q "$DST" "$check")
[ "$A" = "$B" ] || fail "Stand nach Wiederherstellung anders: $A vs $B"
[ "$(q "$DST" "select (select coalesce(sum(n),0) from game.score_counts) = (select count(*) from game.scores)")" = "t" ] || fail "Rang-Zähler nicht neu aufgebaut"
# Neue Buchungen laufen weiter (Zähler der Buchungs-IDs stimmt), neue Konten bekommen weiter eine Start-Ausstattung
q "$DST" "select game.book('$U', 'coins', 1, 'test')" >/dev/null
V=$(q "$DST" "insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id")
[ "$(q "$DST" "select count(*) from game.wallets where player_id = '$V'")" = "1" ] || fail "neues Konto ohne Start-Ausstattung"
echo "Sicherung + Wiederherstellung: $B"
