#!/usr/bin/env bash
# Lasttest: füllt eine frische Datenbank mit vielen Spielern und misst die wichtigen Abfragen
# (EXPLAIN ANALYZE) und den Durchsatz der Server-Funktionen (pgbench).
#   supabase/local/load-test.sh [Spieler=100000] [Sekunden=20] [Verbindungen=16]
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; SB="$ROOT/supabase"
PLAYERS="${1:-100000}"; SECS="${2:-20}"; CONN="${3:-16}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
# KEEP=<Ordner>: Datenbank dort behalten und beim nächsten Lauf wiederverwenden (spart das Befüllen)
FRESH=1
if [ -n "${KEEP:-}" ]; then DATA="$KEEP/data"; SOCK="$KEEP/sock"; mkdir -p "$SOCK"; [ -f "$DATA/PG_VERSION" ] && FRESH=0; else DATA="$(mktemp -d)"; SOCK="$(mktemp -d)"; fi
PORT="${PGPORT:-55433}"; OUT="${OUT:-$(mktemp -d)}"
RUNAS=""; [ "$(id -u)" = "0" ] && { mkdir -p "$DATA"; chown -R postgres "$DATA" "$SOCK"; chmod 777 "$OUT"; RUNAS="sudo -u postgres"; }
if [ -n "${KEEP:-}" ]; then trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true' EXIT
else trap '$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT; fi
[ "$FRESH" = 1 ] && $RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
# etwa wie eine kleine Supabase-Instanz
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-k $SOCK -p $PORT -c shared_buffers=256MB -c max_connections=100 -c work_mem=4MB -c synchronous_commit=on -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all -c track_functions=all" -w start >/dev/null
DB="postgresql://postgres@/postgres?host=$SOCK&port=$PORT"
q() { psql "$DB" -qtAX -v ON_ERROR_STOP=1 -c "$1"; }
if [ "$FRESH" = 1 ]; then
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$SB/local/supabase-stub.sql"
for f in "$SB"/migrations/*.sql; do psql "$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$SB/catalog.sql"
psql "$DB" -q -v ON_ERROR_STOP=1 -f "$SB/seed.sql"

echo "== Testdaten: $PLAYERS Spieler"
T0=$(date +%s.%N)
q "insert into auth.users (is_anonymous, email) select g % 3 = 0, 'p' || g from generate_series(1, $PLAYERS) g"
T1=$(date +%s.%N)
echo "   Konten anlegen (mit Start-Ausstattung): $(echo "($T1 - $T0) * 1000 / $PLAYERS" | bc -l | cut -c1-5) ms pro Spieler"
q "update game.players set name = 'S' || replace(id::text, '-', ''), level = 1 + (random() * 40)::int, last_seen_at = now() - make_interval(days => (random() * 200)::int, secs => random() * 86400)"
# Verlauf: im Schnitt 30 Buchungen pro Spieler
q "insert into game.ledger (player_id, currency, delta, balance_after, reason, created_at)
   select p.id, 'coins', 1 + (random() * 90)::int, 0, 'match_cpu', now() - make_interval(days => (random() * 90)::int, secs => random() * 86400)
   from game.players p, generate_series(1, 30)"
q "insert into game.scores (board, period, player_id, score) select 'endless', 'all', id, (random() * 60)::int from game.players"
q "insert into game.scores (board, period, player_id, score) select 'daily', d::date::text, id, (random() * 500)::int
   from game.players, generate_series(current_date - 40, current_date, '1 day') d where random() < 0.05"
q "insert into game.ratings (player_id, season_id, mmr, games) select id, 1, 600 + (random() * 1600)::int, 10 from game.players where level >= 5"
q "insert into game.matches (mode, season_id, p1, p2, status, created_at, settled_at)
   select 'ranked', 1, a.id, b.id, 'settled', now() - make_interval(days => (random() * 60)::int, secs => random() * 86400), now()
   from (select id, row_number() over () rn from game.players) a join (select id, row_number() over () rn from game.players) b on b.rn = a.rn + 1, generate_series(1, 5)"
q "insert into game.friends (player_id, friend_id, status) select a.id, b.id, 'accepted' from (select id, row_number() over () rn from game.players) a
   join (select id, row_number() over () rn from game.players) b on b.rn between a.rn + 1 and a.rn + 10"
q "vacuum analyze"
fi
if [ -n "${REAPPLY:-}" ]; then  # geänderte Migrationen auf die gefüllte Datenbank (sie sind wiederholbar)
  for f in "$SB"/migrations/*.sql; do psql "$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
fi
q "select game.rebuild_score_counts()" >/dev/null; q "analyze" >/dev/null
q "select 'Tabellen: ' || string_agg(relname || '=' || n_live_tup, ' ' order by n_live_tup desc) from pg_stat_user_tables where schemaname = 'game' and n_live_tup > 1000"
q "select 'Größe der Datenbank: ' || pg_size_pretty(pg_database_size(current_database()))"

U=$(q "select id from game.players order by random() limit 1")
UL=$(q "select id from game.players where level >= 5 order by random() limit 1")
echo; echo "== Abfragepläne (Zeit pro Aufruf)"
plan() { # $1 Name, $2 SQL, $3 Nutzer, $4 Rolle
  local t; t=$(psql "$DB" -qtAX -c "begin; select set_config('request.jwt.claim.sub', '$3', true); set local role ${4:-authenticated}; explain (analyze, format json) $2; rollback;" | python3 -c "import json,sys; t=sys.stdin.read(); d=json.loads(t[t.index('['):])[0]; print(round(d['Execution Time'],2))")
  printf "   %-34s %8s ms\n" "$1" "$t"
}
for i in 1 2; do plan "warm" "select api.me()" "$U" >/dev/null; done
plan "api.me()" "select api.me()" "$U"
plan "api.leaderboard endless top 50" "select api.leaderboard('endless','all',50,0)" "$U"
plan "api.leaderboard Seite 1000" "select api.leaderboard('endless','all',50,50000)" "$U"
plan "api.my_rank endless" "select api.my_rank('endless')" "$U"
plan "api.ranked_board" "select api.ranked_board(50,0)" "$U"
plan "api.friends()" "select api.friends()" "$U"
plan "api.report_cpu_match" "select api.report_cpu_match('{\"mode\":\"cpu\",\"won\":true,\"goals\":2,\"conceded\":1,\"duration\":90,\"head\":\"head:kalle\",\"diff\":1}', 'plan-key-' || gen_random_uuid())" "$U"
plan "api.queue_join + poll" "select api.queue_join('casual','head:kalle'), api.queue_poll()" "$UL"
plan "game.maintenance()" "select game.maintenance()" "$U" postgres

echo; echo "== Durchsatz: $CONN Verbindungen, je $SECS s"
q "drop table if exists public.bench_users; create table public.bench_users as select id, row_number() over () as n from game.players where level >= 5; create index on public.bench_users (n)"
NB=$(q "select count(*) from public.bench_users")
mkbench() { # $1 Name, $2 SQL mit :uid
  cat > "$OUT/$1.sql" <<SQL
\set n random(1, $NB)
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.bench_users where n = :n), true);
set local role authenticated;
$2;
commit;
SQL
}
mkbench me "select api.me()"
mkbench match "select api.report_cpu_match('{\"mode\":\"cpu\",\"won\":true,\"goals\":2,\"conceded\":1,\"duration\":90,\"head\":\"head:kalle\",\"diff\":1}', md5(random()::text))"
mkbench board "select api.leaderboard('endless','all',50,0)"
mkbench rank "select api.my_rank('endless')"
mkbench queue "select api.queue_join('casual','head:kalle'); select api.queue_poll()"
q "delete from game.rate_limits"
q "create extension if not exists pg_stat_statements" >/dev/null
for b in ${BENCH:-me match board rank queue}; do
  q "select pg_stat_statements_reset(); select pg_stat_reset()" >/dev/null
  r=$(sudo -u postgres "$PGBIN/pgbench" -n -c "$CONN" -j 2 -T "$SECS" -f "$OUT/$b.sql" -h "$SOCK" -p "$PORT" -U postgres postgres 2>&1 | grep -E "^tps|latency average|failed" | tr '\n' ' ')
  printf "   %-8s %s\n" "$b" "$r"
  if [ -n "${PROFILE:-}" ]; then  # teuerste Anweisungen innerhalb der Funktionen
    q "select '      ' || lpad(round(total_exec_time)::text, 7) || ' ms ' || lpad(calls::text, 7) || 'x  ' || left(regexp_replace(query, '\s+', ' ', 'g'), 90)
       from pg_stat_statements where query not ilike '%pg_stat%' and query not ilike 'begin%' and query not ilike 'commit%' order by total_exec_time desc limit 14"
  fi
  q "delete from game.rate_limits" >/dev/null
done
q "select '   Wartung danach: ' || game.maintenance()::text"
