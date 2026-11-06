#!/usr/bin/env bash
# Sicherung aller Spielerdaten: Konten (auth.users, auth.identities) und Spielstand (Schema game, ohne Katalog).
# Struktur und Katalog kommen beim Wiederherstellen aus dem Repo, die Sicherung enthält nur Daten.
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<passwort>@<pooler-host>:5432/postgres' bash supabase/ops/backup.sh [ordner]
# Mit BACKUP_PASSPHRASE wird verschlüsselt (gpg, AES256). Enthält personenbezogene Daten: sicher aufbewahren.
set -euo pipefail
URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt (Dashboard -> Connect -> Session pooler)}"
DIR="${1:-backups}"; mkdir -p "$DIR"
F="$DIR/kopfball-$(date -u +%Y%m%d-%H%M%S).sql.gz"
# Katalog (items, products, task_defs, achievement_defs, career_*, chest_defs, banned_words) nicht sichern: kommt aus catalog.sql.
# Kurzlebiges (requests, rate_limits, match_queue) auch nicht.
pg_dump "$URL" --data-only --no-owner --no-privileges \
  -t 'game.*' -t auth.users -t auth.identities \
  -T game.items -T game.products -T game.task_defs -T game.achievement_defs -T game.career_leagues -T game.career_stages -T game.chest_defs \
  -T game.requests -T game.rate_limits -T game.match_queue | gzip -9 > "$F"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$F.gpg" "$F" && rm "$F"; F="$F.gpg"
fi
echo "Gesichert: $F ($(du -h "$F" | cut -f1))"
