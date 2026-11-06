#!/usr/bin/env bash
# Gleichzeitige Anfragen (echte parallele Verbindungen): kein Doppelausgeben, kein Doppelpaaren.
# Wird von run-tests.sh mit DB_URL aufgerufen. Legt eigene Testkonten an und löscht sie am Ende.
set -euo pipefail
q() { psql "$DB_URL" -qtAX -v ON_ERROR_STOP=1 -c "$1"; }
as_user() { # $1 = Nutzer-ID, $2 = SQL
  psql "$DB_URL" -qtAX -c "begin; select set_config('request.jwt.claim.sub', '$1', true); set local role authenticated; $2; commit;" 2>&1 || true
}
TAG="conc$(date +%s%N)"
trap 'q "delete from auth.users where email like '"'"'$TAG%'"'"'" >/dev/null' EXIT
fail() { echo "ASSERT: $1"; exit 1; }

# 1) Zwei verschiedene Käufe, Geld reicht nur für einen (300 Münzen: Rocco 200, Nala 250), je 10-mal parallel
U=$(q "insert into auth.users (id, email, is_anonymous) values (gen_random_uuid(), '$TAG-a', false) returning id")
q "select game.book('$U', 'coins', 150, 'test')" >/dev/null
for i in $(seq 1 10); do
  as_user "$U" "select api.buy_item('head:rocco', 'coins', 'rocco-key-$i')" > /dev/null &
  as_user "$U" "select api.buy_item('head:nala', 'coins', 'nala-key-$i')" > /dev/null &
done
wait
N=$(q "select count(*) from game.inventory where player_id = '$U' and item_id in ('head:rocco', 'head:nala')")
C=$(q "select coins from game.wallets where player_id = '$U'")
L=$(q "select sum(delta) from game.ledger where player_id = '$U' and currency = 'coins'")
[ "$N" = "1" ] || fail "genau ein Kauf erwartet, es sind $N"
[ "$C" = "$L" ] || fail "Kontostand $C passt nicht zum Ledger $L"
[ "$C" -ge 0 ] || fail "negativer Kontostand"

# 2) Dieselbe Anfrage (gleicher Schlüssel) 20-mal gleichzeitig: einmal ausgeführt
V=$(q "insert into auth.users (id, email, is_anonymous) values (gen_random_uuid(), '$TAG-b', false) returning id")
q "select game.book('$V', 'coins', 1000, 'test')" >/dev/null
for i in $(seq 1 20); do as_user "$V" "select api.buy_item('head:tank', 'coins', 'same-key-123')" > /dev/null & done
wait
D=$(q "select count(*) from game.ledger where player_id = '$V' and reason = 'buy'")
[ "$D" = "1" ] || fail "gleicher Schlüssel: $D Abbuchungen statt 1"

# 3) Tagesbonus 20-mal gleichzeitig: einmal
for i in $(seq 1 20); do as_user "$V" "select api.claim_daily()" > /dev/null & done
wait
D=$(q "select count(*) from game.ledger where player_id = '$V' and reason = 'daily'")
[ "$D" = "1" ] || fail "Tagesbonus $D-mal statt 1"

# 3b) Premium-Pass mit Juwelen 10-mal gleichzeitig (verschiedene Schlüssel): nur einmal abgebucht
q "select game.book('$V', 'gems', 2000, 'test')" >/dev/null
for i in $(seq 1 10); do as_user "$V" "select api.buy_pass_with_gems('pass-key-000$i')" > /dev/null & done
wait
D=$(q "select count(*) from game.ledger where player_id = '$V' and reason = 'pass'")
[ "$D" = "1" ] || fail "Pass $D-mal abgebucht statt 1"

# 3c) Starterpaket (nur einmal pro Spieler) aus zwei Tabs bezahlt, Webhooks gleichzeitig: einmal gutgeschrieben
for i in $(seq 1 10); do
  psql "$DB_URL" -qtAX -c "begin; set local role service_role; select api.grant_purchase('$V', 'stripe', 'pi_conc_$TAG$i', 'starter', 299, 'EUR'); commit;" > /dev/null 2>&1 &
done
wait
D=$(q "select count(*) from game.purchases where player_id = '$V' and product_id = 'starter'")
[ "$D" = "1" ] || fail "Starterpaket $D-mal gebucht statt 1"

# 4) 40 Spieler suchen gleichzeitig Casual: jeder höchstens in einem Spiel, nie gegen sich selbst
IDS=$(q "insert into auth.users (id, email, is_anonymous) select gen_random_uuid(), '$TAG-q' || g, true from generate_series(1, 40) g returning id")
q "update game.players set level = 5 where id in (select id from auth.users where email like '$TAG-q%')" >/dev/null
for id in $IDS; do as_user "$id" "select api.queue_join('casual', 'head:kalle')" > /dev/null & done
wait
for round in 1 2 3; do
  for id in $IDS; do as_user "$id" "select api.queue_poll()" > /dev/null & done
  wait
done
M=$(q "select count(*) from game.matches where p1 in (select id from auth.users where email like '$TAG-q%')")
DUP=$(q "select count(*) from (select p, count(*) from (select p1 p from game.matches union all select p2 from game.matches) x
         where p in (select id from auth.users where email like '$TAG-q%') group by p having count(*) > 1) d")
SELF=$(q "select count(*) from game.matches where p1 = p2")
PAIRED=$(q "select count(*) from game.match_queue where match_id is not null and player_id in (select id from auth.users where email like '$TAG-q%')")
[ "$DUP" = "0" ] || fail "$DUP Spieler in mehreren Spielen"
[ "$SELF" = "0" ] || fail "Spiel gegen sich selbst"
[ "$M" -ge 18 ] || fail "nur $M von 20 möglichen Paaren gebildet"
[ "$PAIRED" = "$((M * 2))" ] || fail "Warteschlange passt nicht zu den Spielen ($PAIRED vs $M)"
echo "Paare: $M von 20"
