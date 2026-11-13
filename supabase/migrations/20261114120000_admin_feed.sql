-- =====================================================================================
-- Admin-Dashboard: Zeitraum „24 Std“ (api.admin_stats mit days = 1: Stunden statt Tage) und Live-Verlauf
-- (api.admin_feed): Besuche einzelner Spieler als Sitzungen, ohne Namen, E-Mail oder IP. Spieler erscheinen nur unter
-- einem Kürzel, aus dem sich die Spieler-ID nicht zurückrechnen lässt. Nur Daten der letzten 30 Tage (so lange gibt es
-- Ereignisse), ohne Admins und Staff.
-- =====================================================================================

-- Ereignisse eines Spielers in einem Zeitfenster (Sitzungsgrenzen) ohne alle seine Ereignisse zu lesen
create index if not exists events_player_time on game.events (player_id, created_at);
drop index if exists game.events_player;   -- deckt events_player_time mit ab

-- Geheimer Zusatz für die Kürzel: ohne ihn ließe sich zu einer bekannten Spieler-ID das Kürzel ausrechnen
create table if not exists game.feed_salt (
  id integer primary key check (id = 1),
  salt text not null
);
insert into game.feed_salt (id, salt) values (1, md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text)) on conflict do nothing;
alter table game.feed_salt enable row level security;
revoke all on game.feed_salt from public, anon, authenticated;

-- Kürzel eines Spielers: 4 Zeichen ohne leicht verwechselbare (0/O, 1/I), immer gleich
create or replace function game.feed_name(p uuid) returns text
language sql stable set search_path = '' as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(x.h, i) % 32 + 1, 1), '' order by i)
    from (select decode(md5(s.salt || p::text), 'hex') as h from game.feed_salt s where s.id = 1) x, generate_series(0, 3) i
$$;

-- Spuren mit Zeitpunkt (wie game.stat_active, aber nicht je Tag zusammengefasst): für Stunden-Werte
create or replace function game.stat_trace(t_from timestamptz, t_to timestamptz) returns table (player_id uuid, at timestamptz)
language sql stable set search_path = '' as $$
  select x.pid, x.at from (
    select e.player_id as pid, e.created_at as at from game.events e where e.created_at >= t_from and e.created_at < t_to
    union all select l.player_id, l.created_at from game.ledger l where l.created_at >= t_from and l.created_at < t_to
    union all select m.p1, m.created_at from game.matches m where m.created_at >= t_from and m.created_at < t_to
    union all select m.p2, m.created_at from game.matches m where m.created_at >= t_from and m.created_at < t_to
    union all select pl.id, pl.created_at from game.players pl where pl.created_at >= t_from and pl.created_at < t_to
    union all select pl.id, pl.last_seen_at from game.players pl where pl.last_seen_at >= t_from and pl.last_seen_at < t_to
  ) x
  where not game.stat_hidden(x.pid)
$$;

-- ---------- Dashboard ----------
-- Wie 20261112120000_stats.sql, dazu days = 1: die letzten 24 Stunden. Dann Verlauf je Stunde (deutsche Uhrzeit),
-- Herkunft, Trichter, Modi und Online über die letzten 24 Stunden; Kacheln (heute/gestern) bleiben gleich, die Rückkehr
-- neuer Spieler zählt über 7 Tage (nach einem Tag lässt sich noch keine Rückkehr messen).
create or replace function api.admin_stats(days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); hourly boolean := coalesce(admin_stats.days, 30) = 1;
  n integer := case when coalesce(admin_stats.days, 30) = 1 then 1 else least(greatest(coalesce(admin_stats.days, 30), 7), 90) end;
  today date := game.berlin_day(now()); d0 date; t0 timestamptz; tr timestamptz; w7 timestamptz; h0 timestamptz; r jsonb;
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_stats', 120, interval '1 hour');
  -- t0: Beginn des Zeitraums; tr: Beginn der Konten für die Rückkehr (bei Tagen derselbe)
  if hourly then
    t0 := now() - interval '24 hours'; d0 := game.berlin_day(t0); tr := game.berlin_start(today - 6);
    h0 := date_trunc('hour', now(), 'Europe/Berlin') - interval '23 hours';
  else
    d0 := today - (n - 1); t0 := game.berlin_start(d0); tr := t0;
  end if;
  w7 := case when hourly then t0 else game.berlin_start(today - 6) end;
  with
  act as (select * from game.stat_active(tr, now() + interval '1 minute')),
  trc as (select * from game.stat_trace(h0, now() + interval '1 minute') where hourly),
  pl as (select x.id, x.created_at, game.berlin_day(x.created_at) as day, x.created_at >= t0 as inp from game.players x
          where x.created_at >= tr and not game.stat_hidden(x.id)),
  ev as (select e.player_id, e.kind, e.data, e.created_at, game.berlin_day(e.created_at) as day from game.events e
          where e.created_at >= tr and not game.stat_hidden(e.player_id)),
  ew as (select * from ev where created_at >= t0),
  mt as (select m.mode, m.created_at, m.p1_started_at, m.p2_started_at from game.matches m
          where m.created_at >= tr - interval '1 day' and not (game.stat_hidden(m.p1) and game.stat_hidden(m.p2))),
  led as (select l.player_id, substr(l.reason, 7) as mode, l.created_at from game.ledger l
           where l.created_at >= tr and l.reason like 'match\_%' and not game.stat_hidden(l.player_id)),
  -- angepfiffen: Gegnersuche, wenn beide den Anpfiff gemeldet haben; Freunde, wenn der Host angepfiffen hat
  onl as (select greatest(p1_started_at, p2_started_at) as at from mt where p1_started_at is not null and p2_started_at is not null
          union all select created_at from ev where kind = 'lobby' and data->>'action' = 'started'),
  onld as (select game.berlin_day(at) as day, at from onl),
  pf as (select player_id, bool_or(kind = 'match_start') as started, bool_or(kind = 'match_end' and data->>'done' = 'true') as done from ev group by 1),
  lf as (select distinct player_id from led),
  fv as (select distinct on (player_id) player_id, coalesce(data->>'src', data->>'ref') as src from ev where kind = 'first_visit' order by player_id, created_at),
  pp as (select pl.id, pl.day, pl.inp, coalesce(fv.src, 'unknown') as src,
                coalesce(pf.started, false) or lf.player_id is not null as started,
                coalesce(pf.done, false) or lf.player_id is not null as done,
                exists (select 1 from act a where a.player_id = pl.id and a.day = pl.day + 1) as d1,
                exists (select 1 from act a where a.player_id = pl.id and a.day between pl.day + 1 and pl.day + 7) as d7
           from pl left join pf on pf.player_id = pl.id left join lf on lf.player_id = pl.id left join fv on fv.player_id = pl.id),
  pw as (select * from pp where inp),
  ret as (select a.day, count(*) as n from act a join game.players x on x.id = a.player_id where game.berlin_day(x.created_at) < a.day group by 1),
  sday as (select g::date as day from generate_series(d0, today, interval '1 day') g where not hourly),
  shr as (select g as h from generate_series(h0, h0 + interval '23 hours', interval '1 hour') g where hourly),
  srch as (select data->>'outcome' as outcome, (data->>'wait_s')::integer as wait_s from ew where kind = 'search_end')
  select jsonb_build_object(
    'today', today, 'days', n, 'from', d0, 'start', t0,
    'unit', case when hourly then 'hour' else 'day' end,
    'cohort_days', case when hourly then 7 else n end,
    'since', (select min(created_at) from game.events),
    'kpi', jsonb_build_object(
      'active',    jsonb_build_array((select count(*) from act where day = today), (select count(*) from act where day = today - 1)),
      'new',       jsonb_build_array((select count(*) from pl where day = today), (select count(*) from pl where day = today - 1)),
      'returning', jsonb_build_array(coalesce((select ret.n from ret where ret.day = today), 0), coalesce((select ret.n from ret where ret.day = today - 1), 0)),
      'online',    jsonb_build_array((select count(*) from onld where day = today), (select count(*) from onld where day = today - 1))),
    'series', case when hourly then
                (select jsonb_agg(jsonb_build_object('hour', s.h,
                  'new', (select count(*) from pl where pl.created_at >= s.h and pl.created_at < s.h + interval '1 hour'),
                  'active', (select count(distinct t.player_id) from trc t where t.at >= s.h and t.at < s.h + interval '1 hour'),
                  'online', (select count(*) from onl where onl.at >= s.h and onl.at < s.h + interval '1 hour')) order by s.h) from shr s)
              else
                (select jsonb_agg(jsonb_build_object('day', s.day,
                  'new', (select count(*) from pl where pl.day = s.day),
                  'active', (select count(*) from act where act.day = s.day),
                  'online', (select count(*) from onld where onld.day = s.day)) order by s.day) from sday s) end,
    -- D1: Konten bis vorgestern bzw. gestern angelegt (der Folgetag muss begonnen haben), D7: mindestens 7 Tage alt
    'retention', jsonb_build_object(
      'd1', jsonb_build_object('cohort', (select count(*) from pp where day <= today - 1), 'back', (select count(*) from pp where day <= today - 1 and d1)),
      'd7', jsonb_build_object('cohort', (select count(*) from pp where day <= today - 7), 'back', (select count(*) from pp where day <= today - 7 and d7))),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('src', src, 'new', nw, 'played', pl_, 'd1', back) order by nw desc, src)
                 from (select src, count(*) as nw, count(*) filter (where started) as pl_, count(*) filter (where d1) as back from pw group by src) z), '[]'),
    'funnel', jsonb_build_object('created', (select count(*) from pw), 'started', (select count(*) from pw where started),
                                 'finished', (select count(*) from pw where done), 'returned', (select count(*) from pw where d1)),
    'modes', coalesce((select jsonb_agg(jsonb_build_object('mode', mode, 'started', st, 'done', dn, 'booked', bk) order by st desc, bk desc, mode) from (
                 select mode, sum(st)::integer as st, sum(dn)::integer as dn, sum(bk)::integer as bk from (
                   select data->>'mode' as mode, count(*) filter (where kind = 'match_start') as st,
                          count(*) filter (where kind = 'match_end' and data->>'done' = 'true') as dn, 0 as bk
                     from ev where created_at >= w7 and kind in ('match_start', 'match_end') group by 1
                   union all
                   select case mode when 'train' then 'training' when 'friend' then 'friends' else mode end, 0, 0, count(*) from led where created_at >= w7 group by 1) u
                 group by mode) z), '[]'),
    'online', jsonb_build_object(
      'searches', (select count(*) from ew where kind = 'search_start'),
      'matched', (select count(*) from srch where outcome = 'matched'),
      'cancel', (select count(*) from srch where outcome = 'cancel'),
      'error', (select count(*) from srch where outcome = 'error'),
      'wait_median', (select percentile_cont(0.5) within group (order by wait_s) from srch where outcome = 'matched'),
      'pairings', (select count(*) from mt where created_at >= t0 and mode in ('casual', 'ranked')),
      'started', (select count(*) from mt where created_at >= t0 and mode in ('casual', 'ranked') and p1_started_at is not null and p2_started_at is not null),
      'direct', (select count(*) from ew where kind = 'net_result' and data->>'path' = 'direct'),
      'relay', (select count(*) from ew where kind = 'net_result' and data->>'path' = 'relay'),
      'failed', (select count(*) from ew where kind = 'net_result' and data->>'path' = 'failed'),
      'lobby_created', (select count(*) from ew where kind = 'lobby' and data->>'action' = 'created'),
      'lobby_joined', (select count(*) from ew where kind = 'lobby' and data->>'action' = 'joined'),
      'lobby_started', (select count(*) from ew where kind = 'lobby' and data->>'action' = 'started'),
      'aborts', coalesce((select jsonb_object_agg(reason, c) from (select data->>'reason' as reason, count(*) as c from ew where kind = 'abort' group by 1) z), '{}')))
  into r;
  return r;
end $$;

-- ---------- Live-Verlauf ----------
-- Alles, was ein Spieler im Zeitfenster getan hat: Ereignisse, Konto angelegt, Online-Spiele (vom Server, auch wenn
-- das Gerät nichts gemeldet hat). ord ordnet Gleichzeitiges (Konto vor dem ersten Ereignis).
create or replace function game.feed_items(t_from timestamptz, t_to timestamptz)
returns table (pid uuid, at timestamptz, ord bigint, kind text, data jsonb)
language sql stable set search_path = '' as $$
  select x.pid, x.at, x.ord, x.kind, x.data from (
    select e.player_id as pid, e.created_at as at, e.id as ord, e.kind, e.data from game.events e
     where e.created_at >= t_from and e.created_at < t_to
    union all select pl.id, pl.created_at, 0, 'account', '{}'::jsonb from game.players pl
     where pl.created_at >= t_from and pl.created_at < t_to
    union all select s.pid, m.created_at, 0, 'online',
                     jsonb_build_object('mode', m.mode, 'started', m.p1_started_at is not null and m.p2_started_at is not null, 'status', m.status)
      from game.matches m cross join lateral (values (m.p1), (m.p2)) s(pid)
     where m.created_at >= t_from and m.created_at < t_to
  ) x
  where not game.stat_hidden(x.pid)
$$;

-- Hat der Spieler zwischen t_from und t_to etwas getan? (Sitzung reicht vielleicht über das Zeitfenster hinaus)
create or replace function game.feed_before(p uuid, t_from timestamptz, t_to timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from game.events e where e.player_id = p and e.created_at >= t_from and e.created_at < t_to)
      or exists (select 1 from game.players pl where pl.id = p and pl.created_at >= t_from and pl.created_at < t_to)
      or exists (select 1 from game.matches m where m.p1 = p and m.created_at >= t_from and m.created_at < t_to)
      or exists (select 1 from game.matches m where m.p2 = p and m.created_at >= t_from and m.created_at < t_to)
$$;

-- Eine Seite aus dem Zeitfenster ab t_lo: Sitzungen (Lücke unter 30 Minuten = dieselbe Sitzung), die vor t_end enden,
-- neueste zuerst, lim Stück. Eine Sitzung, die am unteren Rand vielleicht früher begann, ist unsicher. enough: die
-- Seite stimmt (sonst ruft api.admin_feed mit größerem Fenster noch einmal). Je Sitzung höchstens 30 Ereignisse (die letzten).
create or replace function game.admin_feed_page(t_lo timestamptz, t_end timestamptz, lim integer, at_min boolean) returns jsonb
language sql stable set search_path = '' as $$
  with it as (select * from game.feed_items(t_lo, t_end + interval '30 minutes')),
  g as (select it.*, case when lag(it.at) over w is null or it.at - lag(it.at) over w >= interval '30 minutes' then 1 else 0 end as brk
          from it window w as (partition by it.pid order by it.at, it.ord)),
  s as (select g.*, sum(g.brk) over (partition by g.pid order by g.at, g.ord rows unbounded preceding) as sid from g),
  b as (select s.pid, s.sid, min(s.at) as t0, max(s.at) as t1 from s group by 1, 2),
  c as (select b.*, at_min or b.t0 >= t_lo + interval '30 minutes' or not game.feed_before(b.pid, b.t0 - interval '30 minutes', t_lo) as sure
          from b where b.t1 < t_end),
  rk as (select c.*, row_number() over (order by c.t1 desc, c.pid) as rn from c where c.sure),
  -- Gleichzeitig endende Sitzungen bleiben auf derselben Seite (die nächste Seite beginnt vor diesem Zeitpunkt)
  kth as (select t1 from rk where rn = lim),
  pick as (select * from rk where not exists (select 1 from kth) or rk.t1 >= (select t1 from kth)),
  more as (select exists (select 1 from rk where rk.t1 < (select t1 from kth)) as v),
  ev as (select s.pid, s.sid, s.at, s.ord, s.kind, s.data,
                row_number() over (partition by s.pid, s.sid order by s.at desc, s.ord desc) as rn
           from s join pick k on k.pid = s.pid and k.sid = s.sid),
  md as (select pid, sid, jsonb_object_agg(mode, c) as modes from (
           select pid, sid, data->>'mode' as mode, count(*) as c from ev where kind = 'match_start' group by 1, 2, 3) z group by 1, 2),
  agg as (select ev.pid, ev.sid, count(*) as n,
                 bool_or(ev.kind in ('account', 'first_visit')) as nw,
                 (array_agg(ev.data order by ev.at) filter (where ev.kind = 'first_visit'))[1] as fv,
                 count(*) filter (where ev.kind = 'match_start') as games,
                 count(*) filter (where ev.kind = 'match_end' and ev.data->>'done' = 'true') as done,
                 count(*) filter (where ev.kind = 'match_end' and ev.data->>'done' = 'false') as quit,
                 count(*) filter (where ev.kind = 'lobby' and ev.data->>'action' in ('created', 'joined')) as lobbies,
                 count(*) filter (where ev.kind = 'search_start') as searches,
                 count(*) filter (where ev.kind = 'online' and (ev.data->>'started')::boolean) as online,
                 jsonb_agg(jsonb_build_object('at', ev.at, 'kind', ev.kind) || ev.data order by ev.at, ev.ord) filter (where ev.rn <= 30) as events
            from ev group by 1, 2)
  select jsonb_build_object(
    'enough', at_min or ((select v from more) and coalesce((select max(t1) from c where not sure), '-infinity') < (select t1 from kth)),
    'next', case when (select v from more) then (select t1 from kth) end,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'player', game.feed_name(k.pid),
        'new', a.nw,
        'registered', not coalesce((select u.is_anonymous from auth.users u where u.id = k.pid), true),
        'src', a.fv->>'ref', 'campaign', a.fv->>'src',
        'start', k.t0, 'end', k.t1,
        'count', a.n, 'more', greatest(a.n - 30, 0),
        'sum', jsonb_build_object('games', a.games, 'done', a.done, 'quit', a.quit, 'lobbies', a.lobbies, 'searches', a.searches,
                                  'online', a.online, 'modes', coalesce(m.modes, '{}')),
        'events', a.events) order by k.t1 desc, k.pid)
      from pick k join agg a on a.pid = k.pid and a.sid = k.sid left join md m on m.pid = k.pid and m.sid = k.sid), '[]'))
$$;

-- Sitzungen neueste zuerst; before: nur Sitzungen, die davor enden (next der vorigen Seite). Das Zeitfenster wächst,
-- bis die Seite voll und sicher ist (meist reichen die letzten Stunden). Ruft das Dashboard alle 30 s.
create or replace function api.admin_feed(p_before timestamptz default null, p_limit integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); lim integer := least(greatest(coalesce(p_limit, 60), 1), 200);
  t_end timestamptz := least(coalesce(p_before, now() + interval '1 minute'), now() + interval '1 minute');
  t_min timestamptz := now() - interval '30 days'; span interval := interval '6 hours'; t_lo timestamptz; r jsonb;
begin
  perform game.require_admin(p);
  perform game.limit_rate(p, 'admin_feed', 600, interval '1 hour');
  loop
    t_lo := greatest(t_min, t_end - span);
    r := game.admin_feed_page(t_lo, t_end, lim, t_lo <= t_min);
    exit when (r->>'enough')::boolean;
    span := span * 4;
  end loop;
  return jsonb_build_object('items', r->'items', 'next', r->'next', 'now', now());
end $$;

revoke execute on all functions in schema api, game from public;
revoke all on function api.admin_stats(integer), api.admin_feed(timestamptz, integer) from public, anon;
grant execute on function api.admin_stats(integer), api.admin_feed(timestamptz, integer) to authenticated;
