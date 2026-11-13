#!/usr/bin/env bash
# Sicherung in ein frisches Projekt einspielen (z. B. nachdem ein altes Projekt gelöscht wurde).
# Erst deploy.sh (Schema, Funktionen, Katalog), dann dieses Skript (Daten). Verweigert, wenn schon Spieler da sind.
#   SUPABASE_DB_URL=... [BACKUP_PASSPHRASE=...] bash supabase/ops/restore.sh backups/kopfball-....sql.gz[.gpg]
set -euo pipefail
URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt}"; F="${1:?Sicherungsdatei fehlt}"
N=$(psql "$URL" -qtAX -c "select (select count(*) from auth.users) + (select count(*) from game.players)")
[ "$N" = "0" ] || { echo "Abbruch: Ziel hat schon $N Konten/Spieler. Nur in ein leeres Projekt einspielen."; exit 1; }
if [[ "$F" == *.gpg ]]; then
  dec() { gpg --batch --quiet --pinentry-mode loopback --passphrase "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE fehlt}" -d "$F" | gunzip; }
else dec() { gunzip -c "$F"; }; fi
# Alles oder nichts. session_replication_role = replica schaltet Trigger und Fremdschlüssel-Prüfung für diese
# Sitzung ab (so empfiehlt es Supabase), damit beim Einspielen der Konten keine neue Start-Ausstattung entsteht
# und die Reihenfolge der Tabellen egal ist. Erste Saison, Grundeinstellungen, Push-Zustand und Kürzel-Zusatz aus deploy.sh
# weichen den gesicherten (die Kürzel im Live-Verlauf bleiben so dieselben).
{ echo "set session_replication_role = replica;"
  echo "delete from game.seasons; delete from game.config; delete from game.admin_push_state; delete from game.feed_salt;"   # gesicherte Werte (auch spätere Anpassungen) gelten
  dec
  echo "set session_replication_role = origin;"
  echo "delete from auth.users where id in (select user_id from game.erasures);"   # seit der Sicherung gelöschte Konten bleiben gelöscht
  echo "select game.rebuild_score_counts();"
} | psql "$URL" -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null
psql "$URL" -qtAX -c "select 'Zurückgespielt: ' || (select count(*) from game.players) || ' Spieler, ' || (select count(*) from game.ledger) || ' Buchungen'"
