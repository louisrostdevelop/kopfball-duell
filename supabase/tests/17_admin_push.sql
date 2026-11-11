-- Push-Mitteilungen für Admins (20261113120000_admin_push.sql): api.am_admin ohne Fehler; Einstellungen und Geräte nur
-- für Admins mit gesichertem Konto; api.admin_push_digest nur für den Dienst, bündelt (30 Minuten, Nachtruhe 23–8 Uhr),
-- meldet jeden Spieler nur einmal, ohne Admins und Staff, Rekord und Tagesbilanz einmal am Tag, je Admin nach Wunsch.
-- Tageszeiten in deutscher Zeit über game.admin_push_digest_at; Tage im Jahr 2030, damit nichts anderes mitzählt.
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
-- Uhrzeit in Berlin
create function pg_temp.bt(t text) returns timestamptz language sql as $$ select t::timestamp at time zone 'Europe/Berlin' $$;
create function pg_temp.user(anon boolean default false) returns uuid language sql as $$
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), anon) returning id $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

create temp table ids (k text primary key, id uuid);
grant all on ids to public;
insert into ids select k, pg_temp.user(k in ('guest', 'gadm')) from unnest(array['adm', 'adm2', 'user', 'guest', 'gadm', 'staff']) k;
insert into game.admins select id from ids where k in ('adm', 'adm2', 'gadm');
insert into game.staff (player_id) select id from ids where k = 'staff';
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;

-- ---------- Rechte, am_admin ----------
do $$
declare f text;
begin
  foreach f in array array['admin_push_digest()', 'admin_push_gone(text[])', 'admin_push_ok(text[])', 'admin_push_secrets()'] loop
    assert not has_function_privilege('authenticated', 'api.' || f, 'execute'), 'Spieler darf nicht: ' || f;
    assert not has_function_privilege('anon', 'api.' || f, 'execute'), 'anon darf nicht: ' || f;
    assert has_function_privilege('service_role', 'api.' || f, 'execute'), 'Dienst darf: ' || f;
  end loop;
  foreach f in array array['am_admin()', 'admin_push_get()', 'admin_push_prefs(jsonb)', 'admin_push_subscribe(text, text, text, text)',
                           'admin_push_unsubscribe(text)', 'admin_push_test()'] loop
    assert has_function_privilege('authenticated', 'api.' || f, 'execute'), 'angemeldet darf: ' || f;
    assert not has_function_privilege('anon', 'api.' || f, 'execute'), 'anon darf nicht: ' || f;
  end loop;
  assert not has_function_privilege('authenticated', 'game.admin_push_digest_at(timestamptz)', 'execute'), 'game nicht für Spieler';

  perform pg_temp.login(pg_temp.id('adm'));   assert api.am_admin(), 'Admin';
  perform pg_temp.fails('select api.admin_push_digest()', '42501');
  perform pg_temp.fails('select api.admin_push_gone(array[''x''])', '42501');
  perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('user'));  assert not api.am_admin(), 'kein Admin'; perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('guest')); assert not api.am_admin(), 'Gast'; perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('gadm'));  assert not api.am_admin(), 'Admin mit Gast-Konto'; perform pg_temp.logout();
  perform pg_temp.login(null);                assert not api.am_admin(), 'ohne Nutzer-ID'; perform pg_temp.logout();
  raise notice 'Rechte ok';
end $$;

-- ---------- Einstellungen ----------
do $$
declare r jsonb;
begin
  perform pg_temp.login(pg_temp.id('user'));
  perform pg_temp.fails('select api.admin_push_get()', 'forbidden');
  perform pg_temp.fails('select api.admin_push_prefs(''{"online":false}'')', 'forbidden');
  perform pg_temp.fails('select api.admin_push_subscribe(''https://push.example/u'', repeat(''k'', 87), repeat(''a'', 22))', 'forbidden');
  perform pg_temp.fails('select api.admin_push_unsubscribe(''https://push.example/u'')', 'forbidden');
  perform pg_temp.fails('select api.admin_push_test()', 'forbidden');
  perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('gadm')); perform pg_temp.fails('select api.admin_push_get()', 'forbidden'); perform pg_temp.logout();

  perform pg_temp.login(pg_temp.id('adm'));
  r := api.admin_push_get();
  assert r = '{"prefs":{"online":true,"friends":true,"record":true,"daily":true},"devices":0}', 'Vorgabe: alles an ' || r;
  r := api.admin_push_prefs('{"online":false}');
  assert r->'prefs' = '{"online":false,"friends":true,"record":true,"daily":true}', 'nur online aus ' || r;
  r := api.admin_push_prefs('{"daily":false,"record":false}');
  assert r->'prefs' = '{"online":false,"friends":true,"record":false,"daily":false}', 'teilweise ' || r;
  r := api.admin_push_prefs('{}');
  assert r->'prefs' = '{"online":false,"friends":true,"record":false,"daily":false}', 'leer ändert nichts';
  perform pg_temp.fails('select api.admin_push_prefs(''{"foo":true}'')', 'bad_input');
  perform pg_temp.fails('select api.admin_push_prefs(''{"online":"ja"}'')', 'bad_input');
  perform pg_temp.fails('select api.admin_push_prefs(''{"online":null}'')', 'bad_input');
  perform pg_temp.fails('select api.admin_push_prefs(''[true]'')', 'bad_input');
  perform pg_temp.fails('select api.admin_push_prefs(null)', 'bad_input');
  assert api.admin_push_get()->'prefs' = '{"online":false,"friends":true,"record":false,"daily":false}', 'Fehler ändern nichts';
  r := api.admin_push_prefs('{"online":true,"friends":true,"record":true,"daily":true}');
  assert r->'prefs' = '{"online":true,"friends":true,"record":true,"daily":true}', 'wieder alles an';
  perform pg_temp.logout();
  raise notice 'Einstellungen ok';
end $$;

-- ---------- Geräte ----------
do $$
declare k text := repeat('B', 86) || 'w'; au text := 'aaaaaaaaaaaaaaaaaaaaaa'; r jsonb;
begin
  perform pg_temp.login(pg_temp.id('adm'));
  assert (api.admin_push_subscribe('https://push.example/1', k, au, 'Handy')->>'devices')::int = 1, 'angemeldet';
  assert (api.admin_push_subscribe('https://push.example/1', k, au, 'Handy neu')->>'devices')::int = 1, 'dieselbe Adresse: ersetzt';
  perform pg_temp.fails(format('select api.admin_push_subscribe(%L, %L, %L)', 'http://push.example/2', k, au), 'bad_input');
  perform pg_temp.fails(format('select api.admin_push_subscribe(%L, %L, %L)', 'https://push.example/' || repeat('x', 1000), k, au), 'bad_input');
  perform pg_temp.fails(format('select api.admin_push_subscribe(%L, %L, %L)', 'https://push.example/2', 'kurz', au), 'bad_input');
  perform pg_temp.fails(format('select api.admin_push_subscribe(%L, %L, %L)', 'https://push.example/2', k, 'mit leer zeichen'), 'bad_input');
  perform pg_temp.fails(format('select api.admin_push_subscribe(%L, %L, %L)', 'https://push.example/2', k, null), 'bad_input');
  perform pg_temp.logout();
  assert (select label from game.admin_push_subs where endpoint = 'https://push.example/1') = 'Handy neu', 'Name übernommen';
  -- dasselbe Gerät meldet ein anderer Admin an: gehört danach ihm
  perform pg_temp.login(pg_temp.id('adm2'));
  assert (api.admin_push_subscribe('https://push.example/1', k, au)->>'devices')::int = 1, 'zum zweiten Admin';
  perform pg_temp.logout();
  perform pg_temp.login(pg_temp.id('adm'));
  assert (api.admin_push_get()->>'devices')::int = 0, 'beim ersten weg';
  -- fremde Adresse abmelden: nichts passiert; fehlende: kein Fehler
  assert (api.admin_push_unsubscribe('https://push.example/1')->>'devices')::int = 0, 'fremdes Gerät';
  assert (api.admin_push_unsubscribe('https://push.example/nix')->>'devices')::int = 0, 'fehlendes Gerät';
  -- höchstens 10 je Admin, das älteste fällt raus
  for i in 1..12 loop r := api.admin_push_subscribe('https://push.example/n' || i, k, au); end loop;
  assert (r->>'devices')::int = 10, 'höchstens 10: ' || r;
  assert (api.admin_push_unsubscribe('https://push.example/n12')->>'devices')::int = 9, 'abgemeldet';
  perform pg_temp.logout();
  assert not exists (select 1 from game.admin_push_subs where endpoint in ('https://push.example/n1', 'https://push.example/n2')), 'älteste raus';
  assert exists (select 1 from game.admin_push_subs where endpoint = 'https://push.example/1' and player_id = pg_temp.id('adm2')), 'fremdes bleibt';

  -- Probe an die eigenen Geräte, begrenzt
  perform pg_temp.login(pg_temp.id('adm2'));
  r := api.admin_push_test();
  assert jsonb_array_length(r) = 1 and r->0->>'endpoint' = 'https://push.example/1' and r->0->>'body' = 'Test: Benachrichtigungen kommen an.'
     and r->0->>'tag' = 'headstars-admin' and r->0->>'url' = '/admin.html' and r->0->>'p256dh' = k and r->0->>'auth' = au, 'Probe ' || r;
  for i in 2..10 loop perform api.admin_push_test(); end loop;
  perform pg_temp.fails('select api.admin_push_test()', 'rate_limited');
  perform pg_temp.logout();

  -- Dienst: abgelaufene Adressen weg, erfolgreiche vermerkt
  set local role service_role;
  assert (api.admin_push_ok(array['https://push.example/1'])->>'updated')::int = 1, 'ok vermerkt';
  assert (api.admin_push_gone(array['https://push.example/n3', 'https://push.example/nix'])->>'removed')::int = 1, 'gelöscht';
  assert jsonb_typeof(api.admin_push_digest()) = 'array', 'Dienst darf Digest';
  reset role;
  assert (select last_ok_at is not null from game.admin_push_subs where endpoint = 'https://push.example/1'), 'last_ok_at';
  raise notice 'Geräte ok';
end $$;

-- ---------- Sammeln und Bündeln ----------
do $$
declare r jsonb; st game.admin_push_state; d date := '2030-06-10'; d1 date := '2030-06-11';
  n1 uuid; n2 uuid; n3 uuid; n4 uuid; n5 uuid; n6 uuid; n7 uuid; f1 uuid; f2 uuid; old uuid; oldf uuid; v uuid;
  adm uuid := pg_temp.id('adm'); adm2 uuid := pg_temp.id('adm2'); staff uuid := pg_temp.id('staff');
begin
  -- je ein Gerät: adm will alles, adm2 nichts
  delete from game.admin_push_subs;
  insert into game.admin_push_subs (endpoint, player_id, p256dh, auth) values
    ('https://push.example/a', adm, repeat('k', 87), repeat('a', 22)), ('https://push.example/b', adm2, repeat('k', 87), repeat('a', 22));
  perform pg_temp.login(adm2); perform api.admin_push_prefs('{"online":false,"friends":false,"record":false,"daily":false}'); perform pg_temp.logout();
  update game.admin_push_state set cursor_at = pg_temp.bt('2030-06-10 07:00'), last_sent_at = null, pending = '{}', best_active = 100,
         best_day = null, cur_day = d, record_sent_day = null, daily_sent_day = null;

  n1 := pg_temp.user(); n2 := pg_temp.user(); n3 := pg_temp.user(); n4 := pg_temp.user(); n5 := pg_temp.user(); n6 := pg_temp.user(true);
  n7 := pg_temp.user(); f1 := pg_temp.user(true); f2 := pg_temp.user(); old := pg_temp.user(); oldf := pg_temp.user();
  update game.players set created_at = pg_temp.bt('2030-06-10 08:00') where id = n1;

  -- Schon vorher gespielt (Ereignis bzw. nur noch die Buchung): beim Einspielen als gesehen vermerkt
  insert into game.events (player_id, kind, data, created_at) values (old, 'match_start', '{"mode":"ranked"}', pg_temp.bt('2030-05-01 12:00'));
  perform game.book(oldf, 'coins', 10, 'match_friend', 'x');
  perform game.admin_push_seed();
  assert (select count(*) from game.admin_push_seen where player_id = old and kind = 'online') = 1, 'altes Online-Spiel gesehen';
  assert (select count(*) from game.admin_push_seen where player_id = oldf and kind = 'friends') = 1, 'alte Freunde-Buchung gesehen';
  assert game.admin_push_seed() = 0, 'Einspielen wiederholbar';

  -- 09:00: drei zum ersten Mal online (Ereignis, Spiel beider Seiten), zwei mit Freunden (Spielstart, Anpfiff als Host);
  -- Staff, Admin und die schon Bekannten zählen nicht
  insert into game.events (player_id, kind, data, created_at) values
    (n1, 'match_start', '{"mode":"casual"}', pg_temp.bt('2030-06-10 08:55')),
    (staff, 'match_start', '{"mode":"ranked"}', pg_temp.bt('2030-06-10 08:56')),
    (adm, 'match_start', '{"mode":"casual"}', pg_temp.bt('2030-06-10 08:57')),
    (f1, 'match_start', '{"mode":"friends"}', pg_temp.bt('2030-06-10 08:58')),
    (f2, 'lobby', '{"action":"started"}', pg_temp.bt('2030-06-10 08:58')),
    (staff, 'lobby', '{"action":"started"}', pg_temp.bt('2030-06-10 08:58')),
    (old, 'match_start', '{"mode":"ranked"}', pg_temp.bt('2030-06-10 08:59')),
    (oldf, 'match_start', '{"mode":"friends"}', pg_temp.bt('2030-06-10 08:59'));
  insert into game.matches (mode, p1, p2, created_at, p1_started_at, p2_started_at) values
    ('ranked', n2, n3, pg_temp.bt('2030-06-10 08:49'), pg_temp.bt('2030-06-10 08:50'), pg_temp.bt('2030-06-10 08:50')),
    ('casual', n4, staff, pg_temp.bt('2030-06-10 08:49'), pg_temp.bt('2030-06-10 08:50'), null);   -- nie angepfiffen
  r := game.admin_push_digest_at(pg_temp.bt('2030-06-10 09:00'));
  assert jsonb_array_length(r) = 1, 'ein Gerät (adm2 will nichts): ' || r;
  assert r->0 = jsonb_build_object('endpoint', 'https://push.example/a', 'p256dh', repeat('k', 87), 'auth', repeat('a', 22), 'title', 'Headstars',
                                   'body', '3 neue Spieler zum ersten Mal online · 2 zum ersten Mal mit Freunden', 'tag', 'headstars-admin', 'url', '/admin.html'), 'Mitteilung ' || r;
  assert not exists (select 1 from game.admin_push_seen where player_id in (staff, adm, n4)), 'Staff, Admin, nicht angepfiffen: nicht gezählt';

  -- 09:10: n1 spielt wieder (zählt nicht noch einmal), n4 zum ersten Mal: wartet (letzte Mitteilung vor 10 Minuten)
  insert into game.events (player_id, kind, data, created_at) values
    (n1, 'match_start', '{"mode":"ranked"}', pg_temp.bt('2030-06-10 09:05')), (n4, 'match_start', '{"mode":"casual"}', pg_temp.bt('2030-06-10 09:06'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-10 09:10')) = '[]', 'gebremst';
  assert (select pending->>'online' from game.admin_push_state) = '1', 'bleibt liegen';
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-10 09:20')) = '[]', 'noch gebremst';
  r := game.admin_push_digest_at(pg_temp.bt('2030-06-10 09:30'));
  assert jsonb_array_length(r) = 1 and r->0->>'body' = '1 neuer Spieler zum ersten Mal online', 'nach 30 Minuten: ' || r;
  -- nichts Neues: nichts
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-10 10:10')) = '[]', 'nichts Neues';
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-10 10:10')) = '[]', 'derselbe Lauf zweimal';
  select * into st from game.admin_push_state;
  assert st.last_sent_at = pg_temp.bt('2030-06-10 09:30') and st.pending = '{}', 'Zustand ' || to_jsonb(st);

  -- Nachtruhe: nichts verschickt, morgens um 8 eine Mitteilung „über Nacht“ mit der Tagesbilanz von gestern
  insert into game.events (player_id, kind, data, created_at) values (n5, 'match_start', '{"mode":"casual"}', pg_temp.bt('2030-06-10 23:10'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-10 23:20')) = '[]', 'nachts nichts';
  insert into game.events (player_id, kind, data, created_at) values (n6, 'match_start', '{"mode":"friends"}', pg_temp.bt('2030-06-11 03:00'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 03:10')) = '[]', 'nachts nichts';
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 07:50')) = '[]', 'vor 8 nichts';
  select * into st from game.admin_push_state;
  assert st.pending->>'online' = '1' and st.pending->>'friends' = '1' and st.pending ? 'daily' and st.pending ? 'night', 'gesammelt ' || st.pending;
  assert st.cur_day = d1 and st.best_active = 100, 'Tag abgeschlossen, kein Bestwert';
  r := game.admin_push_digest_at(pg_temp.bt('2030-06-11 08:00'));
  -- gestern aktiv: n1–n5, f1, f2, old, oldf (ohne Admin und Staff); neu: n1; online: Spiel n2–n3 und Anpfiff von f2
  assert jsonb_array_length(r) = 1 and r->0->>'title' = 'Headstars · über Nacht'
     and r->0->>'body' = E'1 neuer Spieler zum ersten Mal online · 1 zum ersten Mal mit Freunden\nGestern: 9 aktiv · 1 neu · 2 Online-Spiele', 'morgens: ' || r;
  assert (select daily_sent_day from game.admin_push_state) = d, 'Tagesbilanz von gestern verschickt';

  -- Rekord: heute mehr Aktive als am besten Tag (ohne Staff), einmal am Tag, verschickt mit der neuesten Zahl
  update game.admin_push_state set best_active = 3;
  for i in 1..3 loop
    v := pg_temp.user(); insert into game.events (player_id, kind, created_at) values (v, 'visit', pg_temp.bt('2030-06-11 08:10'));
  end loop;
  insert into game.events (player_id, kind, created_at) values (staff, 'visit', pg_temp.bt('2030-06-11 08:10'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 08:20')) = '[]', 'Rekord gebremst (letzte Mitteilung 8:00)';
  assert (select pending->'record' from game.admin_push_state) = jsonb_build_object('day', d1, 'n', 4), 'Rekord liegt bereit';
  v := pg_temp.user(); insert into game.events (player_id, kind, created_at) values (v, 'visit', pg_temp.bt('2030-06-11 08:25'));
  r := game.admin_push_digest_at(pg_temp.bt('2030-06-11 08:30'));
  assert jsonb_array_length(r) = 1 and r->0->>'body' = 'Neuer Rekord: 5 aktive heute' and r->0->>'title' = 'Headstars', 'Rekord mit neuester Zahl: ' || r;
  v := pg_temp.user(); insert into game.events (player_id, kind, created_at) values (v, 'visit', pg_temp.bt('2030-06-11 09:40'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 09:50')) = '[]', 'Rekord nur einmal am Tag';

  -- Tagesbilanz ab 21 Uhr, einmal; adm2 will jetzt nur sie
  perform pg_temp.login(adm2); perform api.admin_push_prefs('{"daily":true}'); perform pg_temp.logout();
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 20:50')) = '[]', 'vor 21 Uhr keine Bilanz';
  r := game.admin_push_digest_at(pg_temp.bt('2030-06-11 21:00'));
  assert jsonb_array_length(r) = 2, 'beide wollen die Bilanz: ' || r;
  assert (select count(*) from jsonb_array_elements(r) x where x->>'body' = 'Heute: 6 aktiv · 0 neu · 0 Online-Spiele') = 2, 'Bilanz ' || r;
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 21:40')) = '[]', 'Bilanz nur einmal';
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-11 22:50')) = '[]', 'Bilanz nur einmal';

  -- Nur, was jemand will: online will keiner mehr, also keine Mitteilung; liegen bleibt es auch nicht
  perform pg_temp.login(adm); perform api.admin_push_prefs('{"online":false}'); perform pg_temp.logout();
  insert into game.events (player_id, kind, data, created_at) values (n7, 'match_start', '{"mode":"ranked"}', pg_temp.bt('2030-06-12 10:00'));
  assert game.admin_push_digest_at(pg_temp.bt('2030-06-12 10:10')) = '[]', 'online will keiner';
  select * into st from game.admin_push_state;
  assert st.pending = '{}' and st.last_sent_at = pg_temp.bt('2030-06-11 21:00'), 'verworfen, Bremse unverändert ' || to_jsonb(st);
  assert exists (select 1 from game.admin_push_seen where player_id = n7), 'trotzdem gesehen';
  -- 11.06. abgeschlossen: 6 Aktive (n6 und 5 Besucher) sind der neue Bestwert
  assert st.best_active = 6 and st.best_day = d1, 'Bestwert ' || to_jsonb(st);
  raise notice 'Digest ok';
end $$;

-- ---------- Erster Lauf nach dem Einspielen ----------
do $$
declare p uuid := pg_temp.user();
begin
  -- Wer kurz vor dem Einspielen gespielt hat, ist schon gesehen und wird nicht gemeldet
  insert into game.events (player_id, kind, data, created_at) values (p, 'match_start', '{"mode":"casual"}', pg_temp.bt('2030-07-01 09:50'));
  perform game.admin_push_seed();
  update game.admin_push_state set cursor_at = pg_temp.bt('2030-07-01 10:00'), last_sent_at = null, pending = '{}',
         best_active = 1000, cur_day = '2030-07-01', record_sent_day = null, daily_sent_day = null;
  assert game.admin_push_digest_at(pg_temp.bt('2030-07-01 10:10')) = '[]', 'keine Flut';
  raise notice 'Einspielen ok';
end $$;
rollback;
