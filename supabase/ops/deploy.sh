#!/usr/bin/env bash
# Backend auf ein (neues oder bestehendes) Supabase-Projekt bringen. Wiederholbar.
#   SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=... SUPABASE_DB_URL=... bash supabase/ops/deploy.sh <projekt-ref>
# Danach steht alles: Schema, Funktionen, Rechte, Katalog, Wartung, Edge Functions.
set -euo pipefail
REF="${1:?Projekt-Ref fehlt (steht in der Projekt-URL: https://<ref>.supabase.co)}"
cd "$(dirname "$0")/../.."
command -v supabase >/dev/null || { echo "Supabase CLI fehlt: npm i -g supabase  (oder brew install supabase/tap/supabase)"; exit 1; }
echo "1/5 Projekt verknüpfen"; supabase link --project-ref "$REF" ${SUPABASE_DB_PASSWORD:+-p "$SUPABASE_DB_PASSWORD"}
echo "2/5 Migrationen";      supabase db push --include-all
                           # Projekt-Einstellungen aus config.toml (freigegebenes Schema "api", Gast-Anmeldung, Passwortregeln, ...)
                           supabase config push --project-ref "$REF" || echo "   config push nicht möglich: Einstellungen von Hand im Supabase-Dashboard setzen"
echo "3/5 Katalog";          psql "${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt (Dashboard -> Connect -> Session pooler)}" -q -v ON_ERROR_STOP=1 -f supabase/catalog.sql
                           [ "$(psql "$SUPABASE_DB_URL" -qtAX -c 'select count(*) from game.seasons')" = 0 ] && psql "$SUPABASE_DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/ops/new-season.sql && echo "   erste Saison angelegt"
echo "4/5 Edge Functions";   for f in supabase/functions/*/; do n=$(basename "$f"); [ "$n" = "_shared" ] || supabase functions deploy "$n" --project-ref "$REF"; done
echo "5/5 Geheimnisse";      [ -f supabase/.env.production ] && supabase secrets set --env-file supabase/.env.production --project-ref "$REF" || echo "   (supabase/.env.production fehlt: Geheimnisse später mit supabase secrets set setzen)"
echo "Fertig. Prüfen: supabase db lint --linked"
