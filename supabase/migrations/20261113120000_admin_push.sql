-- =====================================================================================
-- Push-Mitteilungen für Admins: wer zum ersten Mal online oder mit Freunden spielt, neuer Tagesrekord, Tagesbilanz am
-- Abend. Gebündelt: die Edge Function admin-push fragt alle 10 Minuten api.admin_push_digest; höchstens eine Mitteilung
-- je 30 Minuten, nachts (23–8 Uhr deutscher Zeit) keine, Liegengebliebenes kommt morgens in einer Mitteilung.
-- Gezählt wird ohne Admins und Staff (wie in der Statistik). Gespeichert wird nur, wer schon gemeldet wurde, und die
-- Push-Adressen der Admin-Geräte; nichts davon ist für Clients lesbar.
-- =====================================================================================

-- Push-Adresse eines Geräts (vom Browser, Web Push). Gehört immer dem zuletzt angemeldeten Admin.
create table if not exists game.admin_push_subs (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  player_id uuid not null references game.admins (player_id) on delete cascade,
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  label text check (length(label) <= 60),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists admin_push_subs_player on game.admin_push_subs (player_id);

-- Was ein Admin bekommen will; ohne Zeile: alles
create table if not exists game.admin_push_prefs (
  player_id uuid primary key references game.admins (player_id) on delete cascade,
  online boolean not null default true,
  friends boolean not null default true,
  record boolean not null default true,
  daily boolean not null default true
);

-- Wer schon als „zum ersten Mal“ gezählt wurde. Hält länger als die Ereignisse (30 Tage): sonst käme jemand nach
-- einer Pause noch einmal.
create table if not exists game.admin_push_seen (
  player_id uuid not null references game.players (id) on delete cascade,
  kind text not null check (kind in ('online', 'friends')),
  at timestamptz not null default now(),
  primary key (player_id, kind)
);

-- Ein einziger Zustand für alle Admins. pending: noch nicht verschickt (online, friends: Anzahl; record: {day, n};
-- daily: {day, active, new, online}; night: in der Nachtruhe angefallen). cursor_at: bis hierher ist gesucht.
-- best_active/best_day: bester abgeschlossener Tag; cur_day: Tag des letzten Laufs (danach wird er abgeschlossen).
create table if not exists game.admin_push_state (
  id integer primary key check (id = 1),
  cursor_at timestamptz,
  last_sent_at timestamptz,
  pending jsonb not null default '{}' check (jsonb_typeof(pending) = 'object'),
  best_active integer not null default 0,
  best_day date,
  cur_day date,
  record_sent_day date,
  daily_sent_day date
);

-- Online-Spiele der letzten Minuten finden, ohne alle Spiele zu lesen
create index if not exists matches_created on game.matches (created_at);

do $$ declare t text; begin
  foreach t in array array['admin_push_subs', 'admin_push_prefs', 'admin_push_seen', 'admin_push_state'] loop
    execute format('alter table game.%I enable row level security', t);
    execute format('revoke all on game.%I from public, anon, authenticated', t);
    execute format('grant select on game.%I to service_role', t);
  end loop;
end $$;

-- ---------- Wer hat schon online bzw. mit Freunden gespielt ----------
-- Alle Spuren, auch ältere als die Ereignisse: Spiele (12 Monate) und Buchungen (dauerhaft). Läuft einmal beim
-- Einspielen: wer vorher schon gespielt hat, wird nicht mehr gemeldet (sonst käme beim ersten Lauf eine Flut).
create or replace function game.admin_push_seed() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into game.admin_push_seen (player_id, kind, at)
  select pid, k, now() from (
    select e.player_id as pid, case when e.data->>'mode' = 'friends' then 'friends' else 'online' end as k
      from game.events e where e.kind = 'match_start' and e.data->>'mode' in ('casual', 'ranked', 'friends')
    union all select e.player_id, 'friends' from game.events e where e.kind = 'lobby' and e.data->>'action' = 'started'
    union all select m.p1, case when m.mode = 'friend' then 'friends' else 'online' end from game.matches m
               where m.p1_started_at is not null and m.p2_started_at is not null
    union all select m.p2, case when m.mode = 'friend' then 'friends' else 'online' end from game.matches m
               where m.p1_started_at is not null and m.p2_started_at is not null
    union all select l.player_id, case when l.reason = 'match_friend' then 'friends' else 'online' end from game.ledger l
               where l.reason in ('match_casual', 'match_ranked', 'match_friend')
  ) x group by pid, k
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Zahlen eines Tages (wie die Kacheln in api.admin_stats) ----------
create or replace function game.admin_push_active(d date, t_to timestamptz) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct player_id)::integer from game.stat_active(game.berlin_start(d), least(t_to, game.berlin_start(d + 1))) where day = d
$$;

create or replace function game.admin_push_day(d date, t_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('day', d,
    'active', game.admin_push_active(d, t_to),
    'new', (select count(*) from game.players x where x.created_at >= game.berlin_start(d) and x.created_at < least(t_to, game.berlin_start(d + 1))
              and not game.stat_hidden(x.id)),
    'online', (select count(*) from game.matches m
                where m.created_at >= game.berlin_start(d) - interval '1 day' and m.created_at < t_to
                  and m.p1_started_at is not null and m.p2_started_at is not null
                  and game.berlin_day(greatest(m.p1_started_at, m.p2_started_at)) = d and greatest(m.p1_started_at, m.p2_started_at) < t_to
                  and not (game.stat_hidden(m.p1) and game.stat_hidden(m.p2)))
            + (select count(*) from game.events e
                where e.kind = 'lobby' and e.data->>'action' = 'started'
                  and e.created_at >= game.berlin_start(d) and e.created_at < least(t_to, game.berlin_start(d + 1))
                  and not game.stat_hidden(e.player_id)))
$$;

-- „heute“, „gestern“ oder Datum, aus Sicht von today
create or replace function game.admin_push_daylabel(d date, today date) returns text
language sql immutable set search_path = '' as $$
  select case when d = today then 'heute' when d = today - 1 then 'gestern' else 'am ' || to_char(d, 'DD.MM.') end
$$;

-- ---------- Sammeln und Bündeln ----------
-- Ein Lauf: Neues seit dem letzten Lauf in pending sammeln; wenn erlaubt (keine Nachtruhe, letzte Mitteilung mindestens
-- 30 Minuten her) und etwas ansteht, je Gerät eine Mitteilung mit den Teilen, die der Admin will, und pending leeren.
-- t_now ist die Uhrzeit des Laufs (Tests spielen damit Tageszeiten durch).
create or replace function game.admin_push_digest_at(t_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s game.admin_push_state; pend jsonb; out jsonb := '[]';
  today date := game.berlin_day(t_now);
  hr integer := extract(hour from (t_now at time zone 'Europe/Berlin'))::integer;
  quiet boolean := hr >= 23 or hr < 8;
  from_ts timestamptz; n integer; a record; parts text[]; line text; body text; msg jsonb;
begin
  insert into game.admin_push_state (id, cursor_at, cur_day) values (1, t_now, today) on conflict do nothing;
  -- gesperrt: zwei gleichzeitige Läufe zählen nichts doppelt
  select * into s from game.admin_push_state where id = 1 for update;
  pend := s.pending;
  -- Überlappung: ein Ereignis trägt die Startzeit seiner Transaktion und kann nach dem letzten Lauf sichtbar werden.
  -- Doppelt Gefundenes fängt admin_push_seen ab.
  from_ts := coalesce(s.cursor_at, t_now) - interval '1 hour';

  -- zum ersten Mal online: Spielstart Gegnersuche (Ereignis) oder Spiel, das beide angepfiffen haben
  with c as (
    select e.player_id as pid, e.created_at as t from game.events e
     where e.kind = 'match_start' and e.data->>'mode' in ('casual', 'ranked') and e.created_at > from_ts and e.created_at <= t_now
    union all select m.p1, greatest(m.p1_started_at, m.p2_started_at) from game.matches m
     where m.mode in ('casual', 'ranked') and m.created_at > from_ts - interval '1 hour' and m.created_at <= t_now
       and m.p1_started_at is not null and m.p2_started_at is not null and greatest(m.p1_started_at, m.p2_started_at) <= t_now
    union all select m.p2, greatest(m.p1_started_at, m.p2_started_at) from game.matches m
     where m.mode in ('casual', 'ranked') and m.created_at > from_ts - interval '1 hour' and m.created_at <= t_now
       and m.p1_started_at is not null and m.p2_started_at is not null and greatest(m.p1_started_at, m.p2_started_at) <= t_now),
  ins as (
    insert into game.admin_push_seen (player_id, kind, at)
    select pid, 'online', min(t) from c where not game.stat_hidden(pid) group by pid
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  if n > 0 then pend := jsonb_set(pend, '{online}', to_jsonb(coalesce((pend->>'online')::integer, 0) + n)); end if;

  -- zum ersten Mal mit Freunden: Spielstart im Freunde-Modus oder Anpfiff als Host
  with c as (
    select e.player_id as pid, e.created_at as t from game.events e
     where ((e.kind = 'match_start' and e.data->>'mode' = 'friends') or (e.kind = 'lobby' and e.data->>'action' = 'started'))
       and e.created_at > from_ts and e.created_at <= t_now
    union all select m.p1, greatest(m.p1_started_at, m.p2_started_at) from game.matches m
     where m.mode = 'friend' and m.created_at > from_ts - interval '1 hour' and m.created_at <= t_now
       and m.p1_started_at is not null and m.p2_started_at is not null and greatest(m.p1_started_at, m.p2_started_at) <= t_now
    union all select m.p2, greatest(m.p1_started_at, m.p2_started_at) from game.matches m
     where m.mode = 'friend' and m.created_at > from_ts - interval '1 hour' and m.created_at <= t_now
       and m.p1_started_at is not null and m.p2_started_at is not null and greatest(m.p1_started_at, m.p2_started_at) <= t_now),
  ins as (
    insert into game.admin_push_seen (player_id, kind, at)
    select pid, 'friends', min(t) from c where not game.stat_hidden(pid) group by pid
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  if n > 0 then pend := jsonb_set(pend, '{friends}', to_jsonb(coalesce((pend->>'friends')::integer, 0) + n)); end if;

  -- Neuer Tag: den letzten Tag ganz auszählen und als Bestwert übernehmen, wenn er besser war
  if s.cur_day is not null and s.cur_day < today then
    n := game.admin_push_active(s.cur_day, game.berlin_start(s.cur_day + 1));
    if n > s.best_active then s.best_active := n; s.best_day := s.cur_day; end if;
  end if;
  s.cur_day := greatest(coalesce(s.cur_day, today), today);
  -- Rekord: heute mehr Aktive als am besten Tag bisher, einmal am Tag (bis zum Versand mit der neuesten Zahl)
  if s.record_sent_day is distinct from today then
    n := game.admin_push_active(today, t_now);
    if n > s.best_active and n > 0 then pend := jsonb_set(pend, '{record}', jsonb_build_object('day', today, 'n', n)); end if;
  end if;
  -- Tagesbilanz ab 21 Uhr, einmal am Tag; bis Mitternacht mit den neuesten Zahlen
  if hr >= 21 and s.daily_sent_day is distinct from today then
    pend := jsonb_set(pend, '{daily}', game.admin_push_day(today, t_now));
  end if;

  -- in der Nachtruhe Liegengebliebenes kommt morgens als „über Nacht“
  if pend - 'night' = '{}' then pend := '{}'; elsif quiet then pend := pend || '{"night":true}'; end if;

  -- 29 statt 30 Minuten: der Zeitplan läuft alle 10 Minuten und kommt mal ein paar Sekunden früher
  if not quiet and pend - 'night' <> '{}' and (s.last_sent_at is null or t_now >= s.last_sent_at + interval '29 minutes') then
    for a in select ad.player_id, coalesce(pr.online, true) as online, coalesce(pr.friends, true) as friends,
                    coalesce(pr.record, true) as record, coalesce(pr.daily, true) as daily
               from game.admins ad join auth.users u on u.id = ad.player_id and not coalesce(u.is_anonymous, true)
               left join game.admin_push_prefs pr on pr.player_id = ad.player_id loop
      parts := array[]::text[];
      n := coalesce((pend->>'online')::integer, 0);
      if a.online and n > 0 then
        parts := parts || case when n = 1 then '1 neuer Spieler zum ersten Mal online' else n || ' neue Spieler zum ersten Mal online' end;
      end if;
      n := coalesce((pend->>'friends')::integer, 0);
      if a.friends and n > 0 then parts := parts || (n || ' zum ersten Mal mit Freunden'); end if;
      if a.record and pend ? 'record' then
        parts := parts || ('Neuer Rekord: ' || (pend->'record'->>'n') || ' aktive ' || game.admin_push_daylabel((pend->'record'->>'day')::date, today));
      end if;
      body := array_to_string(parts, ' · ');
      if a.daily and pend ? 'daily' then
        line := initcap(game.admin_push_daylabel((pend->'daily'->>'day')::date, today)) || ': '
             || (pend->'daily'->>'active') || ' aktiv · ' || (pend->'daily'->>'new') || ' neu · '
             || (pend->'daily'->>'online') || case when (pend->'daily'->>'online')::integer = 1 then ' Online-Spiel' else ' Online-Spiele' end;
        body := case when body = '' then line else body || E'\n' || line end;
      end if;
      continue when body = '';
      select coalesce(jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth,
               'title', case when pend ? 'night' then 'Headstars · über Nacht' else 'Headstars' end,
               'body', body, 'tag', 'headstars-admin', 'url', '/admin.html') order by x.created_at), '[]')
        into msg from game.admin_push_subs x where x.player_id = a.player_id;
      out := out || msg;
    end loop;
    -- Abgeholt ist abgeholt, auch für Admins, die einen Teil nicht wollen (sonst käme er später gesammelt)
    if pend ? 'record' then s.record_sent_day := (pend->'record'->>'day')::date; end if;
    if pend ? 'daily' then s.daily_sent_day := (pend->'daily'->>'day')::date; end if;
    pend := '{}';
    if jsonb_array_length(out) > 0 then s.last_sent_at := t_now; end if;
  end if;

  update game.admin_push_state set cursor_at = greatest(coalesce(s.cursor_at, t_now), t_now), last_sent_at = s.last_sent_at, pending = pend,
         best_active = s.best_active, best_day = s.best_day, cur_day = s.cur_day,
         record_sent_day = s.record_sent_day, daily_sent_day = s.daily_sent_day
   where id = 1;
  return out;
end $$;

-- ---------- Für den Dienst (Edge Function admin-push mit Service-Schlüssel) ----------
create or replace function api.admin_push_digest() returns jsonb
language sql security definer set search_path = '' as $$ select game.admin_push_digest_at(now()) $$;

-- Der Push-Dienst kennt die Adresse nicht mehr (404/410): Gerät abgemeldet oder Browser-Daten gelöscht
create or replace function api.admin_push_gone(endpoints text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from game.admin_push_subs where endpoint = any (coalesce(admin_push_gone.endpoints, array[]::text[]));
  get diagnostics n = row_count;
  return jsonb_build_object('removed', n);
end $$;

create or replace function api.admin_push_ok(endpoints text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update game.admin_push_subs set last_ok_at = now() where endpoint = any (coalesce(admin_push_ok.endpoints, array[]::text[]));
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n);
end $$;

-- ---------- Für Admins ----------
-- Ohne Fehler, auch für Gäste und ohne Anmeldung: die Admin-Seite fragt damit, ob sie Push anbieten soll.
-- Ohne Zählgrenze: nur ein Nachschlagen über den Primärschlüssel (eine Grenze schriebe bei jedem Aufruf).
create or replace function api.am_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from game.admins a join auth.users u on u.id = a.player_id
                  where a.player_id = auth.uid() and not coalesce(u.is_anonymous, true))
$$;

create or replace function game.admin_push_info(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'prefs', jsonb_build_object('online', coalesce(pr.online, true), 'friends', coalesce(pr.friends, true),
                                'record', coalesce(pr.record, true), 'daily', coalesce(pr.daily, true)),
    'devices', (select count(*) from game.admin_push_subs x where x.player_id = p))
  from (select 1) one left join game.admin_push_prefs pr on pr.player_id = p
$$;

create or replace function api.admin_push_get() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_push_get', 120, interval '1 hour');
  return game.admin_push_info(p);
end $$;

-- Nur die vier Schalter, nur true/false; fehlende bleiben wie sie sind
create or replace function api.admin_push_prefs(prefs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); d jsonb := admin_push_prefs.prefs; f text; v jsonb;
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_push_prefs', 60, interval '1 hour');
  if d is null or jsonb_typeof(d) <> 'object' then perform game.fail('bad_input'); end if;
  for f, v in select * from jsonb_each(d) loop
    if not f = any (array['online', 'friends', 'record', 'daily']) or jsonb_typeof(v) <> 'boolean' then perform game.fail('bad_input'); end if;
  end loop;
  insert into game.admin_push_prefs as x (player_id, online, friends, record, daily)
  values (p, coalesce((d->>'online')::boolean, true), coalesce((d->>'friends')::boolean, true),
             coalesce((d->>'record')::boolean, true), coalesce((d->>'daily')::boolean, true))
  on conflict (player_id) do update set
    online = coalesce((d->>'online')::boolean, x.online), friends = coalesce((d->>'friends')::boolean, x.friends),
    record = coalesce((d->>'record')::boolean, x.record), daily = coalesce((d->>'daily')::boolean, x.daily);
  return game.admin_push_info(p);
end $$;

-- Gerät anmelden. Dieselbe Adresse von einem anderen Admin (gemeinsames Gerät) wandert zum Aufrufer.
-- Höchstens 10 Geräte je Admin: das am längsten nicht bestätigte fällt raus (alte Adressen erneuert der Browser still).
create or replace function api.admin_push_subscribe(endpoint text, p256dh text, auth text, label text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); e text := btrim(admin_push_subscribe.endpoint); k text := btrim(admin_push_subscribe.p256dh);
  au text := btrim(admin_push_subscribe.auth); lb text := nullif(left(btrim(coalesce(admin_push_subscribe.label, '')), 60), '');
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_push_subscribe', 30, interval '1 hour');
  if e is null or e !~ '^https://[^\s]+$' or length(e) > 1000
     or k is null or k !~ '^[A-Za-z0-9_-]+={0,2}$' or length(k) not between 20 and 200
     or au is null or au !~ '^[A-Za-z0-9_-]+={0,2}$' or length(au) not between 8 and 100 then
    perform game.fail('bad_input');
  end if;
  -- clock_timestamp: mehrere Anmeldungen in einer Transaktion behalten ihre Reihenfolge
  insert into game.admin_push_subs as x (endpoint, player_id, p256dh, auth, label, created_at)
  values (e, p, k, au, lb, clock_timestamp())
  on conflict on constraint admin_push_subs_pkey do update set player_id = excluded.player_id, p256dh = excluded.p256dh,
    auth = excluded.auth, label = excluded.label, created_at = excluded.created_at, last_ok_at = null;
  delete from game.admin_push_subs x where x.player_id = p and x.endpoint <> e and x.endpoint in (
    select y.endpoint from game.admin_push_subs y where y.player_id = p
     order by coalesce(y.last_ok_at, y.created_at) desc, y.created_at desc offset 10);
  return jsonb_build_object('devices', (select count(*) from game.admin_push_subs x where x.player_id = p));
end $$;

create or replace function api.admin_push_unsubscribe(endpoint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_push_subscribe', 30, interval '1 hour');
  delete from game.admin_push_subs x where x.player_id = p and x.endpoint = btrim(admin_push_unsubscribe.endpoint);
  return jsonb_build_object('devices', (select count(*) from game.admin_push_subs x where x.player_id = p));
end $$;

-- Probe-Mitteilung an die eigenen Geräte (die Edge Function verschickt sie mit dem Token des Admins)
create or replace function api.admin_push_test() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_push_test', 10, interval '1 hour');
  return coalesce((select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth,
           'title', 'Headstars', 'body', 'Test: Benachrichtigungen kommen an.', 'tag', 'headstars-admin', 'url', '/admin.html')
           order by x.created_at) from game.admin_push_subs x where x.player_id = p), '[]');
end $$;

-- ---------- Erster Stand ----------
-- Bisherige Spieler gelten als gesehen; Bestwert aus dem, was es gibt (Buchungen und Spiele reichen weiter zurück als
-- die Ereignisse); gesucht wird ab jetzt.
do $$ begin perform game.admin_push_seed(); end $$;
insert into game.admin_push_state (id, cursor_at, cur_day, best_active, best_day)
select 1, now(), game.berlin_day(now()), coalesce(b.n, 0), b.day
  from (select 1) one left join (
    select day, count(*)::integer as n from game.stat_active(now() - interval '400 days', game.berlin_start(game.berlin_day(now())))
     group by day order by count(*) desc, day desc limit 1) b on true
on conflict (id) do nothing;

-- Schlüssel für den Versand (VAPID) und das Geheimnis des Zeitplans liegen verschlüsselt im Vault, nicht in den
-- Funktions-Secrets: so stehen sie nirgends im Klartext und der Zeitplan liest dasselbe Geheimnis. Nur service_role.
-- Ohne Vault (lokale Test-Datenbank) leer.
create or replace function api.admin_push_secrets() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null then return '{}'::jsonb; end if;
  execute $q$select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb) from vault.decrypted_secrets
            where name in ('admin_push_cron', 'admin_push_vapid_public', 'admin_push_vapid_private')$q$ into r;
  return r;
end $$;

revoke execute on all functions in schema api, game from public;
revoke all on function api.am_admin(), api.admin_push_get(), api.admin_push_prefs(jsonb), api.admin_push_subscribe(text, text, text, text),
  api.admin_push_unsubscribe(text), api.admin_push_test(), api.admin_push_digest(), api.admin_push_gone(text[]), api.admin_push_ok(text[]), api.admin_push_secrets()
  from public, anon, authenticated;
grant execute on function api.am_admin(), api.admin_push_get(), api.admin_push_prefs(jsonb), api.admin_push_subscribe(text, text, text, text),
  api.admin_push_unsubscribe(text), api.admin_push_test() to authenticated;
grant execute on function api.admin_push_digest(), api.admin_push_gone(text[]), api.admin_push_ok(text[]), api.admin_push_secrets() to service_role;
