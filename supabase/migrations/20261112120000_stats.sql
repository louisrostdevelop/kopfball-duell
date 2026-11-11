-- =====================================================================================
-- Nutzungsstatistik und Admin-Dashboard.
-- Ereignisse hängen nur an der (zufälligen) Spieler-ID: keine IP, kein Browser, keine Cookies. Ausgewertet wird nur in
-- Summen (api.admin_stats). Nach 90 Tagen fasst die Wartung sie zu Tagessummen ohne Spielerbezug zusammen
-- (game.event_days) und löscht sie. Admins und Staff (eigene Geräte, Testkonten) zählen in der Statistik nicht mit.
-- =====================================================================================

create table if not exists game.events (
  id bigserial primary key,
  player_id uuid not null references game.players (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}' check (octet_length(data::text) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists events_time on game.events (created_at);
create index if not exists events_kind on game.events (kind, created_at);
create index if not exists events_player on game.events (player_id);

-- Tagessummen nach dem Löschen der Ereignisse. key: wichtigste Angabe des Ereignisses (Modus, Weg, Herkunft …), '' = keine
create table if not exists game.event_days (
  day date not null,
  kind text not null,
  key text not null,
  n integer not null check (n >= 0),
  primary key (day, kind, key)
);

create table if not exists game.admins (
  player_id uuid primary key references game.players (id) on delete cascade
);
create table if not exists game.staff (
  player_id uuid primary key references game.players (id) on delete cascade,
  added_at timestamptz not null default now()
);
-- Einmal-Links „Gerät ausschließen“ (api.admin_staff_link → api.staff_claim)
create table if not exists game.staff_tokens (
  token text primary key,
  until timestamptz not null
);

-- „Neue Spieler je Tag“ ohne die ganze Tabelle zu lesen
create index if not exists players_created on game.players (created_at);

-- wie alle Tabellen in game: RLS an ohne Regeln, kein Zugriff für Clients
do $$ declare t text; begin
  foreach t in array array['events', 'event_days', 'admins', 'staff', 'staff_tokens'] loop
    execute format('alter table game.%I enable row level security', t);
    execute format('revoke all on game.%I from public, anon, authenticated', t);
    execute format('grant select on game.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence game.events_id_seq from public, anon, authenticated;

-- ---------- Hilfen ----------
-- Kalendertage der Statistik in deutscher Zeit (UTC-Tage lägen eine bis zwei Stunden daneben)
create or replace function game.berlin_day(ts timestamptz) returns date
language sql stable set search_path = '' as $$ select (ts at time zone 'Europe/Berlin')::date $$;
create or replace function game.berlin_start(d date) returns timestamptz
language sql stable set search_path = '' as $$ select d::timestamp at time zone 'Europe/Berlin' $$;

-- zählt nicht in der Statistik (Betreiber, eigene Geräte und Testkonten)
create or replace function game.stat_hidden(p uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from game.admins where player_id = p) or exists (select 1 from game.staff where player_id = p)
$$;

-- Aktiv an einem Tag = irgendeine Spur an diesem Tag: Ereignis (die App meldet jeden Tag einmal „visit“), Buchung,
-- Online-Spiel, Konto angelegt oder letzter Besuch. Vor den Ereignissen zählt ein Tag ohne Buchung oder Spiel nur, wenn
-- es der letzte Besuch war (players.last_seen_at hält nur den jüngsten): Rückkehr-Quoten von damals sind eher zu niedrig.
create or replace function game.stat_active(t_from timestamptz, t_to timestamptz) returns table (player_id uuid, day date)
language sql stable set search_path = '' as $$
  select distinct x.pid, game.berlin_day(x.at) from (
    select e.player_id as pid, e.created_at as at from game.events e where e.created_at >= t_from and e.created_at < t_to
    union all select l.player_id, l.created_at from game.ledger l where l.created_at >= t_from and l.created_at < t_to
    union all select m.p1, m.created_at from game.matches m where m.created_at >= t_from and m.created_at < t_to
    union all select m.p2, m.created_at from game.matches m where m.created_at >= t_from and m.created_at < t_to
    union all select pl.id, pl.created_at from game.players pl where pl.created_at >= t_from and pl.created_at < t_to
    union all select pl.id, pl.last_seen_at from game.players pl where pl.last_seen_at >= t_from and pl.last_seen_at < t_to
  ) x
  where not game.stat_hidden(x.pid)
$$;

-- ---------- Ereignis melden ----------
-- Nur bekannte Arten, nur bekannte Felder mit festen Werten (sonst bad_event): so kann niemand freien Text oder
-- persönliche Daten ablegen. first_visit gilt einmal je Konto und nur für frische Konten (sonst stimmt die Herkunft
-- nicht: ein altes Konto meldet nach einem Update seinen ersten Besuch mit dem heutigen Link). visit einmal je Tag.
create or replace function api.track(kind text, data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); k text := track.kind; d jsonb := coalesce(track.data, '{}'); c jsonb := '{}'; f text; v jsonb;
  allowed text[]; need text[];
  match_modes constant text[] := array['cpu', 'cup', 'career', 'endless', 'daily', 'training', 'local', 'friends', 'casual', 'ranked', 'other'];
  net_modes constant text[] := array['friends', 'casual', 'ranked'];
  refs constant text[] := array['direct', 'invite', 'reddit', 'google', 'bing', 'duckduckgo', 'youtube', 'tiktok', 'instagram', 'facebook', 'x', 'discord', 'other'];
begin
  perform game.limit_rate(p, 'track', 200, interval '1 hour');
  if jsonb_typeof(d) <> 'object' or octet_length(d::text) > 300 then perform game.fail('bad_event'); end if;
  case k
    when 'first_visit'  then allowed := array['src', 'ref'];          need := array['ref'];
    when 'visit'        then allowed := array[]::text[];              need := array[]::text[];
    when 'match_start'  then allowed := array['mode'];                need := allowed;
    when 'match_end'    then allowed := array['mode', 'done'];        need := allowed;
    when 'search_start' then allowed := array['mode'];                need := allowed;
    when 'search_end'   then allowed := array['mode', 'outcome', 'wait_s']; need := allowed;
    when 'net_result'   then allowed := array['mode', 'path'];        need := allowed;
    when 'lobby'        then allowed := array['action'];              need := allowed;
    when 'abort'        then allowed := array['mode', 'reason'];      need := allowed;
    else perform game.fail('bad_event');
  end case;
  for f, v in select * from jsonb_each(d) loop
    if not f = any (allowed) then perform game.fail('bad_event'); end if;
    if not (case
      when f = 'mode' and k in ('match_start', 'match_end') then v #>> '{}' = any (match_modes)
      when f = 'mode' and k in ('search_start', 'search_end') then v #>> '{}' in ('casual', 'ranked')
      when f = 'mode' then v #>> '{}' = any (net_modes)
      when f = 'done' then jsonb_typeof(v) = 'boolean'
      when f = 'outcome' then v #>> '{}' in ('matched', 'cancel', 'error')
      when f = 'wait_s' then case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between 0 and 3600 else false end
      when f = 'path' then v #>> '{}' in ('direct', 'relay', 'failed')
      when f = 'action' then v #>> '{}' in ('created', 'joined', 'started')
      when f = 'reason' then v #>> '{}' in ('dropped', 'opp_gone', 'void', 'desync')
      when f = 'src' then case when jsonb_typeof(v) = 'string' then v #>> '{}' ~ '^[a-z0-9_-]{1,40}$' else false end
      when f = 'ref' then v #>> '{}' = any (refs)
      else false end)
    then perform game.fail('bad_event'); end if;
    -- Wartezeit als ganze Sekunden, alles andere wie geprüft
    c := c || jsonb_build_object(f, case when f = 'wait_s' then to_jsonb(round((v #>> '{}')::numeric)::integer) else v end);
  end loop;
  if exists (select 1 from unnest(need) x where not c ? x) then perform game.fail('bad_event'); end if;
  if k = 'first_visit' and (exists (select 1 from game.events e where e.player_id = p and e.kind = 'first_visit')
                            or (select created_at from game.players where id = p) < now() - interval '1 day') then
    return jsonb_build_object('ok', true, 'stored', false);
  end if;
  if k = 'visit' and exists (select 1 from game.events e where e.player_id = p and e.kind = 'visit'
                              and e.created_at >= game.berlin_start(game.berlin_day(now()))) then
    return jsonb_build_object('ok', true, 'stored', false);
  end if;
  insert into game.events (player_id, kind, data) values (p, k, c);
  return jsonb_build_object('ok', true, 'stored', true);
end $$;

-- ---------- Admin ----------
-- Admin = Zeile in game.admins und ein gesichertes Konto (ein Gast-Konto hängt an einem Browser und geht leicht verloren)
create or replace function game.require_admin(p uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from game.admins a join auth.users u on u.id = a.player_id where a.player_id = p and not coalesce(u.is_anonymous, true)) then
    perform game.fail('forbidden');
  end if;
end $$;

-- Einmal-Link, mit dem ein weiteres Gerät (auch ein Gast) aus der Statistik herausfällt; gilt 1 Stunde
create or replace function api.admin_staff_link() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); u timestamptz := now() + interval '1 hour';
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'staff_link', 30, interval '1 hour');
  insert into game.staff_tokens (token, until) values (tok, u);
  return jsonb_build_object('token', tok, 'until', u);
end $$;

create or replace function api.staff_claim(token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.limit_rate(p, 'staff_claim', 10, interval '1 hour');   -- gegen Durchprobieren
  perform game.setup_player(p);   -- frischer Gast, der noch nie api.me gerufen hat
  delete from game.staff_tokens t where t.token = staff_claim.token and t.until > now();
  if not found then perform game.fail('bad_token'); end if;
  insert into game.staff (player_id) values (p) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Alles fürs Dashboard in einer Antwort, ohne Admins und Staff, Tage in deutscher Zeit. days: Zeitraum (7 bis 90 Tage,
-- länger gibt es keine Ereignisse). Online-Spiele zählen, solange nicht beide Seiten ausgenommen sind.
create or replace function api.admin_stats(days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); n integer := least(greatest(coalesce(admin_stats.days, 30), 7), 90);
  today date := game.berlin_day(now()); d0 date; t0 timestamptz; w7 timestamptz; r jsonb;
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_stats', 120, interval '1 hour');
  d0 := today - (n - 1); t0 := game.berlin_start(d0); w7 := game.berlin_start(today - 6);
  with
  act as (select * from game.stat_active(t0, now() + interval '1 minute')),
  pl as (select x.id, game.berlin_day(x.created_at) as day from game.players x where x.created_at >= t0 and not game.stat_hidden(x.id)),
  ev as (select e.player_id, e.kind, e.data, e.created_at, game.berlin_day(e.created_at) as day from game.events e
          where e.created_at >= t0 and not game.stat_hidden(e.player_id)),
  mt as (select m.mode, m.created_at, m.p1_started_at, m.p2_started_at from game.matches m
          where m.created_at >= t0 - interval '1 day' and not (game.stat_hidden(m.p1) and game.stat_hidden(m.p2))),
  led as (select l.player_id, substr(l.reason, 7) as mode, l.created_at from game.ledger l
           where l.created_at >= t0 and l.reason like 'match\_%' and not game.stat_hidden(l.player_id)),
  -- angepfiffen: Gegnersuche, wenn beide den Anpfiff gemeldet haben; Freunde, wenn der Host angepfiffen hat
  onl as (select game.berlin_day(greatest(p1_started_at, p2_started_at)) as day from mt where p1_started_at is not null and p2_started_at is not null
          union all select day from ev where kind = 'lobby' and data->>'action' = 'started'),
  pf as (select player_id, bool_or(kind = 'match_start') as started, bool_or(kind = 'match_end' and data->>'done' = 'true') as done from ev group by 1),
  lf as (select distinct player_id from led),
  fv as (select distinct on (player_id) player_id, coalesce(data->>'src', data->>'ref') as src from ev where kind = 'first_visit' order by player_id, created_at),
  pp as (select pl.id, pl.day, coalesce(fv.src, 'unknown') as src,
                coalesce(pf.started, false) or lf.player_id is not null as started,
                coalesce(pf.done, false) or lf.player_id is not null as done,
                exists (select 1 from act a where a.player_id = pl.id and a.day = pl.day + 1) as d1,
                exists (select 1 from act a where a.player_id = pl.id and a.day between pl.day + 1 and pl.day + 7) as d7
           from pl left join pf on pf.player_id = pl.id left join lf on lf.player_id = pl.id left join fv on fv.player_id = pl.id),
  ret as (select a.day, count(*) as n from act a join game.players x on x.id = a.player_id where game.berlin_day(x.created_at) < a.day group by 1),
  sday as (select g::date as day from generate_series(d0, today, interval '1 day') g),
  srch as (select data->>'outcome' as outcome, (data->>'wait_s')::integer as wait_s from ev where kind = 'search_end')
  select jsonb_build_object(
    'today', today, 'days', n, 'from', d0,
    'since', (select min(created_at) from game.events),
    'kpi', jsonb_build_object(
      'active',    jsonb_build_array((select count(*) from act where day = today), (select count(*) from act where day = today - 1)),
      'new',       jsonb_build_array((select count(*) from pl where day = today), (select count(*) from pl where day = today - 1)),
      'returning', jsonb_build_array(coalesce((select ret.n from ret where ret.day = today), 0), coalesce((select ret.n from ret where ret.day = today - 1), 0)),
      'online',    jsonb_build_array((select count(*) from onl where day = today), (select count(*) from onl where day = today - 1))),
    'series', (select jsonb_agg(jsonb_build_object('day', s.day,
                  'new', (select count(*) from pl where pl.day = s.day),
                  'active', (select count(*) from act where act.day = s.day),
                  'online', (select count(*) from onl where onl.day = s.day)) order by s.day) from sday s),
    -- D1: Konten bis vorgestern bzw. gestern angelegt (der Folgetag muss begonnen haben), D7: mindestens 7 Tage alt
    'retention', jsonb_build_object(
      'd1', jsonb_build_object('cohort', (select count(*) from pp where day <= today - 1), 'back', (select count(*) from pp where day <= today - 1 and d1)),
      'd7', jsonb_build_object('cohort', (select count(*) from pp where day <= today - 7), 'back', (select count(*) from pp where day <= today - 7 and d7))),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('src', src, 'new', nw, 'played', pl_, 'd1', back) order by nw desc, src)
                 from (select src, count(*) as nw, count(*) filter (where started) as pl_, count(*) filter (where d1) as back from pp group by src) z), '[]'),
    'funnel', jsonb_build_object('created', (select count(*) from pp), 'started', (select count(*) from pp where started),
                                 'finished', (select count(*) from pp where done), 'returned', (select count(*) from pp where d1)),
    'modes', coalesce((select jsonb_agg(jsonb_build_object('mode', mode, 'started', st, 'done', dn, 'booked', bk) order by st desc, bk desc, mode) from (
                 select mode, sum(st)::integer as st, sum(dn)::integer as dn, sum(bk)::integer as bk from (
                   select data->>'mode' as mode, count(*) filter (where kind = 'match_start') as st,
                          count(*) filter (where kind = 'match_end' and data->>'done' = 'true') as dn, 0 as bk
                     from ev where created_at >= w7 and kind in ('match_start', 'match_end') group by 1
                   union all
                   select case mode when 'train' then 'training' when 'friend' then 'friends' else mode end, 0, 0, count(*) from led where created_at >= w7 group by 1) u
                 group by mode) z), '[]'),
    'online', jsonb_build_object(
      'searches', (select count(*) from ev where kind = 'search_start'),
      'matched', (select count(*) from srch where outcome = 'matched'),
      'cancel', (select count(*) from srch where outcome = 'cancel'),
      'error', (select count(*) from srch where outcome = 'error'),
      'wait_median', (select percentile_cont(0.5) within group (order by wait_s) from srch where outcome = 'matched'),
      'pairings', (select count(*) from mt where created_at >= t0 and mode in ('casual', 'ranked')),
      'started', (select count(*) from mt where created_at >= t0 and mode in ('casual', 'ranked') and p1_started_at is not null and p2_started_at is not null),
      'direct', (select count(*) from ev where kind = 'net_result' and data->>'path' = 'direct'),
      'relay', (select count(*) from ev where kind = 'net_result' and data->>'path' = 'relay'),
      'failed', (select count(*) from ev where kind = 'net_result' and data->>'path' = 'failed'),
      'lobby_created', (select count(*) from ev where kind = 'lobby' and data->>'action' = 'created'),
      'lobby_joined', (select count(*) from ev where kind = 'lobby' and data->>'action' = 'joined'),
      'lobby_started', (select count(*) from ev where kind = 'lobby' and data->>'action' = 'started'),
      'aborts', coalesce((select jsonb_object_agg(reason, c) from (select data->>'reason' as reason, count(*) as c from ev where kind = 'abort' group by 1) z), '{}')))
  into r;
  return r;
end $$;

-- ---------- Wartung ----------
-- Wie 20261110150000_desync.sql, dazu: Ereignisse älter als 90 Tage in Tagessummen ohne Spielerbezug, abgelaufene
-- Einmal-Links weg
create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer := 0; c integer; d integer; e integer; f integer; g integer; h integer; ev integer; se integer; m record; rep jsonb; side integer;
begin
  -- Warteschlange: wer seit 30 s nicht mehr fragt, ist weg
  delete from game.match_queue where seen_at < now() - interval '30 seconds' and match_id is null;
  get diagnostics a = row_count;
  delete from game.match_queue where enqueued_at < now() - interval '15 minutes';
  -- Nur eine Seite hat gemeldet (die andere ist weg, Absturz oder Aufgeben): deren Meldung gilt.
  -- Hat sie "Gegner weg" gemeldet, gewinnt sie. So bringt Abhauen vor der Niederlage nichts.
  -- Nur nach dem Anpfiff beider Seiten (sonst ließe sich melden, ohne je zu verbinden, und nach 3 min gewinnen)
  for m in select id, report1, report2 from game.matches
            where status = 'open' and (report1 is null) <> (report2 is null)
              and p1_started_at is not null and p2_started_at is not null
              and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'))
              and game.desync_of(coalesce(report1, report2)) is null
            order by created_at limit 200 for update skip locked loop
    side := case when m.report1 is not null then 1 else 2 end; rep := coalesce(m.report1, m.report2);
    perform game.settle(m.id, rep->'score', case when (rep->>'forfeit')::boolean then side end);
    b := b + 1;
  end loop;
  -- einseitig „nicht synchron“ gemeldet (die andere Seite meldet nichts): verfällt (keine Wertung, keine Aufgabe)
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and (report1 is null) <> (report2 is null) and game.desync_of(coalesce(report1, report2)) is not null
     and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'));
  -- einseitig gemeldet, aber nie von beiden angepfiffen: verfällt (keine Wertung)
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and (report1 is null) <> (report2 is null) and (p1_started_at is null or p2_started_at is null)
     and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'));
  -- Strittige oder einseitige Spiele, die der Prüfdienst nach 24 h nicht entschieden hat: verfallen (keine Wertung)
  update game.matches set status = 'void', settled_at = now()
   where status in ('disputed', 'review') and created_at < now() - interval '24 hours';
  -- Spiele ganz ohne Meldung nach 30 Minuten: verfallen
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and created_at < now() - interval '30 minutes' and report1 is null and report2 is null;
  get diagnostics c = row_count;
  -- Doppelt-Schutz-Einträge nach 2 Tagen löschen, Zeitfenster nach 1 Tag
  delete from game.requests where ctid in (select ctid from game.requests where created_at < now() - interval '2 days' limit 5000);
  get diagnostics d = row_count;
  delete from game.rate_limits where window_start < now() - interval '1 day';
  -- Tages-Bestenlisten älter als 30 Tage (in Häppchen, damit nichts lange sperrt)
  delete from game.scores where ctid in (select ctid from game.scores where period <> 'all' and period < (game.today() - 30)::text limit 5000);
  delete from game.score_counts where period <> 'all' and period < (game.today() - 30)::text;
  -- Spiele älter als 12 Monate (abgerechnet oder verfallen), 5000 pro Lauf. Ranked erst nach dem Saisonende-Lauf unten
  -- (rewarded_at): der zählt die verschiedenen Gegner aus den Spielen. Wertung, Statistik, Käufe stehen woanders.
  delete from game.matches where ctid in (
    select x.ctid from game.matches x
     where x.created_at < now() - interval '12 months' and x.status in ('settled', 'void')
       and (x.season_id is null or exists (select 1 from game.seasons sn where sn.id = x.season_id and sn.rewarded_at is not null))
     limit 5000);
  get diagnostics h = row_count;
  -- Nutzungsereignisse älter als 90 Tage: in Tagessummen (ohne Spieler) übernehmen und löschen, 20000 pro Lauf.
  -- Löschen und Zählen in einer Anweisung: nichts wird doppelt oder gar nicht gezählt. Admins und Staff zählen nicht.
  with gone as (
    delete from game.events where id in (select id from game.events where created_at < now() - interval '90 days' order by id limit 20000)
    returning player_id, kind, data, created_at),
  sums as (
    select game.berlin_day(created_at) as day, kind,
           coalesce(case kind when 'first_visit' then coalesce(data->>'src', data->>'ref')
                              when 'match_end' then (data->>'mode') || ':' || (data->>'done')
                              when 'search_end' then (data->>'mode') || ':' || (data->>'outcome')
                              when 'net_result' then (data->>'mode') || ':' || (data->>'path')
                              when 'lobby' then data->>'action'
                              when 'abort' then (data->>'mode') || ':' || (data->>'reason')
                              else data->>'mode' end, '') as key,
           count(*)::integer as n
      from gone where not game.stat_hidden(player_id) group by 1, 2, 3),
  ins as (
    insert into game.event_days as x (day, kind, key, n) select day, kind, key, n from sums
    on conflict (day, kind, key) do update set n = x.n + excluded.n)
  select count(*) into ev from gone;
  delete from game.staff_tokens where until < now();
  -- Gäste ohne Konto, ohne Kauf, 90 Tage nicht da: löschen (hält die Datenbank klein).
  -- Höchstens 500 pro Lauf: alle 10 Minuten = 72.000 am Tag, ohne lange Sperren.
  delete from auth.users u where u.id in (
    select pl.id from game.players pl join auth.users au on au.id = pl.id
     where au.is_anonymous and pl.last_seen_at < now() - interval '90 days'
       and not exists (select 1 from game.purchases pu where pu.player_id = pl.id)
     limit 500);
  get diagnostics e = row_count;
  -- Saisonende: Ranked-Kiste nach erreichter Liga (wer mindestens 5 Spiele gegen mindestens 5 verschiedene Gegner hatte:
  -- hochgespielte Zweitkonten bringen so wenig), einmal pro Saison
  f := 0;
  for se in select id from game.seasons where ends_at < now() and rewarded_at is null order by id loop
    insert into game.chests (player_id, tier, source, ref)
    select r.player_id, case when r.mmr >= 1700 then 'legend' when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season', se::text
      from game.ratings r where r.season_id = se and r.games >= 5 and game.season_opponents(r.player_id, se) >= 5
    on conflict (player_id, source, ref) do nothing;
    get diagnostics g = row_count; f := f + g;
    -- dazu der Rahmen der erreichten Liga (Grenzen wie LEAGUES in js/app/matchmaking.js)
    perform game.give_item(r.player_id, 'frame:league-' || case when r.mmr >= 2000 then 'legend' when r.mmr >= 1700 then 'diamond' when r.mmr >= 1450 then 'platinum'
                                                              when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season')
      from game.ratings r where r.season_id = se and r.games >= 5 and game.season_opponents(r.player_id, se) >= 5;
    update game.seasons set rewarded_at = now() where id = se;
  end loop;
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f, 'oldMatches', h, 'oldEvents', ev);
end $$;

revoke execute on all functions in schema api, game from public;
revoke all on function api.track(text, jsonb) from public, anon;
revoke all on function api.admin_stats(integer) from public, anon;
revoke all on function api.admin_staff_link() from public, anon;
revoke all on function api.staff_claim(text) from public, anon;
grant execute on function api.track(text, jsonb) to authenticated;
grant execute on function api.admin_stats(integer) to authenticated;
grant execute on function api.admin_staff_link() to authenticated;
grant execute on function api.staff_claim(text) to authenticated;
