-- Live-Verlauf und 24 Stunden (20261114120000_admin_feed.sql): api.admin_feed nur für Admins, ohne Admins und Staff,
-- Sitzungen nach Lücken von 30 Minuten, neueste zuerst, Seiten über p_before, höchstens 30 Ereignisse je Sitzung,
-- Kürzel gleichbleibend und ohne die Spieler-ID; api.admin_stats(1): Verlauf je Stunde, Herkunft und Trichter nur
-- über die letzten 24 Stunden.
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.fails(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlerrm <> want and sqlstate <> want then raise exception 'ASSERT: falscher Fehler bei % -> % %', stmt, sqlstate, sqlerrm; end if;
end $$;
create function pg_temp.user(anon boolean default false) returns uuid language sql as $$
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), anon) returning id $$;
-- Minuten vor jetzt
create function pg_temp.ago(m numeric) returns timestamptz language sql as $$ select now() - make_interval(mins => m::integer, secs => (m - floor(m)) * 60) $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

create temp table ids (k text primary key, id uuid);
grant all on ids to public;
insert into ids select k, pg_temp.user(k in ('a', 'c', 'd', 'st', 'e', 'f')) from unnest(array['adm', 'user', 'a', 'b', 'c', 'd', 'st', 'e', 'f']) k;
insert into game.admins select id from ids where k = 'adm';
insert into game.staff (player_id) select id from ids where k = 'st';
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
-- Sitzungen eines Spielers aus einer Antwort
create function pg_temp.of(r jsonb, k text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x order by o), '[]') from jsonb_array_elements(r->'items') with ordinality t(x, o) where x->>'player' = game.feed_name(pg_temp.id(k)) $$;

-- a: neu (Konto, erster Besuch über Reddit) mit zwei Sitzungen; b: gesichert, altes Konto, zwei Sitzungen;
-- c: eine lange Sitzung mit 40 Ereignissen; d: Sitzung über 9 Stunden (länger als das erste Zeitfenster);
-- st und adm: Staff und Admin, erscheinen nie
update game.players set created_at = pg_temp.ago(201) where id = pg_temp.id('a');
update game.players set created_at = now() - interval '40 days' where id in (pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('d'), pg_temp.id('st'), pg_temp.id('adm'));
insert into game.events (player_id, kind, data, created_at) values
  (pg_temp.id('a'), 'first_visit', '{"ref":"reddit","src":"post1"}', pg_temp.ago(200)),
  (pg_temp.id('a'), 'match_start', '{"mode":"cpu"}', pg_temp.ago(190)),
  (pg_temp.id('a'), 'match_end', '{"mode":"cpu","done":true}', pg_temp.ago(170)),
  (pg_temp.id('a'), 'lobby', '{"action":"created"}', pg_temp.ago(100)),
  (pg_temp.id('a'), 'visit', '{}', pg_temp.ago(95)),
  (pg_temp.id('b'), 'visit', '{}', pg_temp.ago(150)),
  (pg_temp.id('b'), 'search_start', '{"mode":"ranked"}', pg_temp.ago(10)),
  (pg_temp.id('st'), 'match_start', '{"mode":"cpu"}', pg_temp.ago(5)),
  (pg_temp.id('adm'), 'match_start', '{"mode":"cpu"}', pg_temp.ago(3));
insert into game.events (player_id, kind, data, created_at)
  select pg_temp.id('c'), 'match_start', '{"mode":"career"}', pg_temp.ago(340 - i) from generate_series(1, 40) i;
insert into game.events (player_id, kind, data, created_at)
  select pg_temp.id('d'), 'visit', '{}', pg_temp.ago(600 - 20 * i) from generate_series(0, 27) i;

-- ---------- Rechte, Kürzel ----------
do $$
declare n text;
begin
  assert not has_function_privilege('anon', 'api.admin_feed(timestamptz, integer)', 'execute'), 'anon darf nicht';
  assert not has_function_privilege('authenticated', 'game.feed_name(uuid)', 'execute'), 'Kürzel nur intern';
  perform pg_temp.login(pg_temp.id('user')); perform pg_temp.fails('select api.admin_feed()', 'forbidden'); perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('st')); perform pg_temp.fails('select api.admin_feed()', 'forbidden'); perform pg_temp.logout();
  n := game.feed_name(pg_temp.id('a'));
  assert n ~ '^[2-9A-HJ-NP-Z]{4}$', 'Kürzel: ' || n;
  assert n = game.feed_name(pg_temp.id('a')), 'gleichbleibend';
  assert n <> game.feed_name(pg_temp.id('b')), 'je Spieler anders';
  assert position(lower(n) in pg_temp.id('a')::text) = 0 and n <> upper(substr(pg_temp.id('a')::text, 1, 4)), 'nicht aus der ID abzulesen';
  assert n <> upper(substr(md5(pg_temp.id('a')::text), 1, 4)), 'nicht ohne Geheimnis nachzurechnen';
  raise notice 'Rechte, Kürzel ok';
end $$;

-- ---------- Sitzungen, Reihenfolge, Ausschluss ----------
do $$
declare r jsonb; a jsonb; b jsonb; c jsonb; d jsonb; prev timestamptz := 'infinity'; it jsonb;
begin
  perform pg_temp.login(pg_temp.id('adm')); r := api.admin_feed(null, 200); perform pg_temp.logout();
  assert r ? 'items' and r ? 'next' and r ? 'now', 'Felder';
  for it in select * from jsonb_array_elements(r->'items') loop
    assert (it->>'end')::timestamptz <= prev, 'neueste zuerst'; prev := (it->>'end')::timestamptz;
    assert (it->>'start')::timestamptz <= (it->>'end')::timestamptz, 'Beginn vor Ende';
  end loop;
  assert jsonb_array_length(pg_temp.of(r, 'st')) = 0 and jsonb_array_length(pg_temp.of(r, 'adm')) = 0, 'ohne Staff und Admin';
  assert r::text not like '%' || pg_temp.id('a')::text || '%', 'keine Spieler-ID in der Antwort';

  a := pg_temp.of(r, 'a');
  assert jsonb_array_length(a) = 2, 'a: zwei Sitzungen (Lücke 70 Minuten): ' || a;
  assert (a->1->>'start')::timestamptz = pg_temp.ago(201) and (a->1->>'end')::timestamptz = pg_temp.ago(170), 'a: erste Sitzung mit Konto';
  assert (a->1->>'new')::boolean and not (a->0->>'new')::boolean, 'a: neu nur in der ersten';
  assert a->1->>'src' = 'reddit' and a->1->>'campaign' = 'post1' and a->0->>'src' is null, 'Herkunft';
  assert not (a->1->>'registered')::boolean, 'a: Gast';
  assert (select array_agg(e->>'kind' order by o) from jsonb_array_elements(a->1->'events') with ordinality t(e, o)) = array['account', 'first_visit', 'match_start', 'match_end'], 'Ereignisse der Reihe nach';
  assert a->1->'events'->2->>'mode' = 'cpu' and (a->1->'events'->3->>'done')::boolean, 'Angaben der Ereignisse';
  assert (a->1->'sum'->>'games')::int = 1 and (a->1->'sum'->>'done')::int = 1 and (a->1->'sum'->'modes'->>'cpu')::int = 1, 'Summen';
  assert (a->0->'sum'->>'lobbies')::int = 1 and (a->0->>'count')::int = 2, 'zweite Sitzung';

  b := pg_temp.of(r, 'b');
  assert jsonb_array_length(b) = 2 and (b->0->>'registered')::boolean and not (b->0->>'new')::boolean, 'b: gesichert, zwei Sitzungen';
  -- Reihenfolge über Spieler: b (vor 10 Min), a (95), b (150), a (170)
  assert (select array_agg(x->>'player' order by o) from jsonb_array_elements(r->'items') with ordinality t(x, o)
           where x->>'player' in (game.feed_name(pg_temp.id('a')), game.feed_name(pg_temp.id('b'))))
       = array[game.feed_name(pg_temp.id('b')), game.feed_name(pg_temp.id('a')), game.feed_name(pg_temp.id('b')), game.feed_name(pg_temp.id('a'))], 'Reihenfolge';

  c := pg_temp.of(r, 'c');
  assert jsonb_array_length(c) = 1 and (c->0->>'count')::int = 40 and (c->0->>'more')::int = 10, 'c: 40 Ereignisse, 10 weggelassen';
  assert jsonb_array_length(c->0->'events') = 30, 'höchstens 30';
  assert (c->0->'events'->29->>'at')::timestamptz = pg_temp.ago(300) and (c->0->'events'->0->>'at')::timestamptz = pg_temp.ago(329), 'die letzten 30';
  assert (c->0->'sum'->>'games')::int = 40, 'Summen über alle';

  d := pg_temp.of(r, 'd');
  assert jsonb_array_length(d) = 1 and (d->0->>'start')::timestamptz = pg_temp.ago(600), 'd: ganze Sitzung über das erste Zeitfenster hinaus: ' || d;
  raise notice 'Sitzungen ok';
end $$;

-- ---------- Seiten ----------
do $$
declare r jsonb; full_ jsonb; got jsonb := '[]'; nx timestamptz; pages int := 0;
begin
  perform pg_temp.login(pg_temp.id('adm'));
  full_ := api.admin_feed(null, 200);
  r := api.admin_feed(null, 2);
  loop
    pages := pages + 1;
    -- mehr als 2 nur bei gleichem Ende (Konten aus derselben Transaktion)
    assert jsonb_array_length(r->'items') <= 2 or (r->'items'->1->>'end') = (r->'items'->-1->>'end'), 'Seitengröße';
    got := got || (r->'items');
    exit when r->>'next' is null or pages > 100;
    nx := (r->>'next')::timestamptz;
    assert nx = (r->'items'->-1->>'end')::timestamptz, 'next = Ende der letzten Sitzung';
    r := api.admin_feed(nx, 2);
    assert (r->'items'->0->>'end') is null or (r->'items'->0->>'end')::timestamptz < nx, 'nur ältere';
  end loop;
  perform pg_temp.logout();
  assert full_->>'next' is null, 'alles auf einer großen Seite';
  assert got = full_->'items', 'Seiten ergeben zusammen dasselbe: ' || jsonb_array_length(got) || ' / ' || jsonb_array_length(full_->'items');
  assert pages >= 4, 'mehrere Seiten';
  raise notice 'Seiten ok';
end $$;

-- ---------- 24 Stunden ----------
do $$
declare r jsonb; w jsonb; h timestamptz;
begin
  -- e: neu in den letzten 24 Stunden (tiktok), f: vor 3 Tagen neu (zählt nur bei 7 Tagen)
  update game.players set created_at = now() - interval '3 days' where id = pg_temp.id('f');
  insert into game.events (player_id, kind, data, created_at) values
    (pg_temp.id('e'), 'first_visit', '{"ref":"tiktok","src":"feed24"}', now()),
    (pg_temp.id('e'), 'match_start', '{"mode":"endless"}', now()),
    (pg_temp.id('f'), 'first_visit', '{"ref":"tiktok","src":"feed24old"}', now() - interval '3 days'),
    (pg_temp.id('f'), 'match_start', '{"mode":"endless"}', now() - interval '3 days');
  perform pg_temp.login(pg_temp.id('adm')); r := api.admin_stats(1); w := api.admin_stats(7); perform pg_temp.logout();
  assert r->>'unit' = 'hour' and w->>'unit' = 'day', 'Einheit';
  assert jsonb_array_length(r->'series') = 24, '24 Stunden';
  assert (select bool_and(x ? 'hour' and x ? 'active' and x ? 'new' and x ? 'online') from jsonb_array_elements(r->'series') x), 'Felder je Stunde';
  h := (r->'series'->-1->>'hour')::timestamptz;
  assert h <= now() and h > now() - interval '1 hour' and extract(minute from h) = 0, 'letzte Stunde ist die jetzige';
  assert (r->'series'->-1->>'hour')::timestamptz - (r->'series'->0->>'hour')::timestamptz = interval '23 hours', 'stündlich';
  assert (r->'series'->-1->>'active')::int >= 1 and (r->'series'->-1->>'new')::int >= 1, 'e in der jetzigen Stunde';
  assert exists (select 1 from jsonb_array_elements(r->'sources') s where s->>'src' = 'feed24'), '24 Std: e';
  assert not exists (select 1 from jsonb_array_elements(r->'sources') s where s->>'src' = 'feed24old'), '24 Std: f nicht';
  assert exists (select 1 from jsonb_array_elements(w->'sources') s where s->>'src' = 'feed24old'), '7 Tage: f';
  assert (r->'funnel'->>'created')::int < (w->'funnel'->>'created')::int, 'Trichter nur 24 Std';
  assert r->'retention' = w->'retention' and (r->>'cohort_days')::int = 7, 'Rückkehr wie 7 Tage';
  assert r->'kpi' = w->'kpi', 'Kacheln gleich';
  assert coalesce((select (m->>'started')::int from jsonb_array_elements(r->'modes') m where m->>'mode' = 'endless'), 0)
       < (select (m->>'started')::int from jsonb_array_elements(w->'modes') m where m->>'mode' = 'endless'), 'Modi nur 24 Std';
  assert (r->>'start')::timestamptz = now() - interval '24 hours', 'Beginn';
  raise notice '24 Std ok';
end $$;
rollback;
