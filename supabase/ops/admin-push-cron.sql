-- Zeitplan für Push-Mitteilungen an Admins: ruft alle 10 Minuten die Edge Function admin-push (Bündeln, Bremse und
-- Nachtruhe stecken in api.admin_push_digest). Wiederholbar; von Hand im echten Projekt ausführen:
--   psql "$SUPABASE_DB_URL" -v project_url=https://usobpjzoupofuhbryhum.supabase.co -f supabase/ops/admin-push-cron.sql
-- Vorher einmal von Hand (nicht hier, damit nichts davon im Repo steht) die Vault-Einträge anlegen, die Zeitplan und
-- Edge Function lesen (api.admin_push_secrets):
--   select vault.create_secret('<zufällig, lang>', 'admin_push_cron');
--   select vault.create_secret('<VAPID öffentlich, base64url>', 'admin_push_vapid_public');
--   select vault.create_secret('<VAPID privat, base64url>', 'admin_push_vapid_private');
-- Das Geheimnis wird bei jedem Lauf aus dem Vault gelesen: Ändern dort wirkt sofort, ohne den Zeitplan neu anzulegen.
\if :{?project_url}
\else
  \set project_url https://usobpjzoupofuhbryhum.supabase.co
\endif
create extension if not exists pg_net;
create extension if not exists pg_cron;
select set_config('admin_push.url', :'project_url' || '/functions/v1/admin-push', false);
-- cron.schedule mit demselben Namen ersetzt den bisherigen Auftrag
select cron.schedule('admin-push', '*/10 * * * *', format($job$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'admin_push_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$job$, current_setting('admin_push.url')));
select jobid, jobname, schedule, active from cron.job where jobname = 'admin-push';
