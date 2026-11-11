-- Gegnersuche „nicht synchron“ (20261110150000_desync.sql): beide melden desync → ungültig; desync gegen Ergebnis →
-- strittig; nur eine Seite desync, die andere nichts → verfällt in der Wartung (keine Wertung, keine Aufgabe)
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

-- frische Konten je Spiel (sonst greifen Abkühlzeit und Gegner-Grenze der Warteschlange)
create function pg_temp.pair(mode text) returns uuid language plpgsql as $$
declare mb jsonb; m uuid; a uuid; b uuid;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into b;
  update game.players set level = 6 where id in (a, b);
  insert into game.ratings (player_id, season_id, mmr, games, wins) select x, 1, 1000, 10, 5 from unnest(array[a, b]) x;
  perform pg_temp.login(a); perform api.queue_join(mode, 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join(mode, 'head:kalle'); mb := api.queue_poll(); perform pg_temp.logout();
  assert (mb->>'matched')::boolean, 'gepaart';
  m := (mb->>'match')::uuid;
  perform pg_temp.login(a); perform api.match_started(m); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.match_started(m); perform pg_temp.logout();
  update game.matches set created_at = now() - interval '3 minutes', p1_started_at = now() - interval '3 minutes', p2_started_at = now() - interval '3 minutes' where id = m;
  return m;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; m uuid; r jsonb;
begin

  -- beide „nicht synchron“ (Ranked): ungültig, keine Wertung
  m := pg_temp.pair('ranked'); select p1, p2 into a, b from game.matches where id = m;
  perform pg_temp.login(a); r := api.report_match(m, '{"desync":true}'); perform pg_temp.logout();
  assert r->>'status' = 'waiting', 'erste Meldung wartet: ' || r::text;
  perform pg_temp.login(b); r := api.report_match(m, '{"desync":"peer"}'); perform pg_temp.logout();
  assert r->>'status' = 'void', 'beide desync: ungültig ' || r::text;
  assert (select report1->>'desync' || '/' || (report2->>'desync') from game.matches where id = m) = 'self/peer', 'Grund gespeichert (alt: true = self)';
  assert (select status from game.matches where id = m) = 'void';
  assert (select sum(mmr) from game.ratings where player_id in (a, b) and season_id = 1) = 2000, 'keine Wertung';
  assert (select count(*) from game.ratings where player_id in (a, b) and season_id = 1 and games = 10) = 2, 'kein Spiel gezählt';

  -- „nicht synchron“ gegen ein Ergebnis (manipulierter Host meldet seinen Sieg): strittig, keine Wertung
  m := pg_temp.pair('ranked'); select p1, p2 into a, b from game.matches where id = m;
  perform pg_temp.login(a); r := api.report_match(m, '{"score":[3,0],"duration":90}'); perform pg_temp.logout();
  perform pg_temp.login(b); r := api.report_match(m, '{"desync":true}'); perform pg_temp.logout();
  assert r->>'status' = 'disputed', 'desync gegen Ergebnis: strittig ' || r::text;
  assert (select sum(mmr) from game.ratings where player_id in (a, b) and season_id = 1) = 2000, 'keine Wertung';
  -- umgekehrte Reihenfolge ebenso
  m := pg_temp.pair('casual'); select p1, p2 into a, b from game.matches where id = m;
  perform pg_temp.login(b); r := api.report_match(m, '{"desync":true}'); perform pg_temp.logout();
  perform pg_temp.login(a); r := api.report_match(m, '{"score":[3,0],"duration":90,"forfeit":true}'); perform pg_temp.logout();
  assert r->>'status' = 'disputed', 'Ergebnis nach desync: strittig ' || r::text;

  -- nur eine Seite „nicht synchron“, die andere meldet nichts: verfällt in der Wartung (nicht als Ergebnis gewertet)
  m := pg_temp.pair('ranked'); select p1, p2 into a, b from game.matches where id = m;
  perform pg_temp.login(b); r := api.report_match(m, '{"desync":true}'); perform pg_temp.logout();
  update game.matches set report2 = jsonb_set(report2, '{at}', to_jsonb(now() - interval '10 minutes')) where id = m and report2 is not null;
  update game.matches set report1 = jsonb_set(report1, '{at}', to_jsonb(now() - interval '10 minutes')) where id = m and report1 is not null;
  perform game.maintenance();
  assert (select status from game.matches where id = m) = 'void', 'einseitig desync: verfällt, ist ' || (select status from game.matches where id = m);
  assert (select sum(mmr) from game.ratings where player_id in (a, b) and season_id = 1) = 2000, 'keine Wertung';

  -- desync ohne Ergebnis braucht keine Dauer und kein Mindestalter des Spiels; ein normales Ergebnis weiter schon
  m := pg_temp.pair('casual'); select p1, p2 into a, b from game.matches where id = m;
  update game.matches set created_at = now() where id = m;
  perform pg_temp.login(a); r := api.report_match(m, '{"desync":true}'); perform pg_temp.logout();
  assert r->>'status' = 'waiting', 'desync sofort möglich';
  -- unbekannter Grund: abgelehnt
  m := pg_temp.pair('casual'); select p1, p2 into a, b from game.matches where id = m;
  perform pg_temp.login(a);
  begin r := api.report_match(m, '{"desync":"x"}'); assert false, 'unbekannter Grund angenommen';
  exception when others then assert sqlerrm = 'bad_report', sqlerrm; end;
  perform pg_temp.logout();
end $$;
rollback;

-- Ranked-Pause (api.queue_join): „nicht synchron“ zählt nicht als strittig; Pause nur bei vielen desync-Spielen in
-- Ranked (für beide Seiten gezählt): ≥ 5 in 24 h gegen ≥ 3 verschiedene Gegner
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.player() returns uuid language plpgsql as $$
declare u uuid;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  update game.players set level = 6 where id = u;
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (u, 1, 1000, 10, 5);
  return u;
end $$;
-- Spiel direkt anlegen (angepfiffen), Meldungen wie angegeben; Ranked, sonst der angegebene Modus
create function pg_temp.game(a uuid, b uuid, st text, r1 jsonb, r2 jsonb, md text default 'ranked') returns void language plpgsql as $$
begin
  insert into game.matches (p1, p2, mode, status, report1, report2, p1_started_at, p2_started_at, created_at)
  values (a, b, md, st, r1, r2, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour');
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

create function pg_temp.can_rank(u uuid) returns boolean language plpgsql as $$
declare ok boolean := true;
begin
  perform pg_temp.login(u);
  begin perform api.queue_join('ranked', 'head:kalle'); perform api.queue_leave();
  exception when others then if sqlerrm <> 'cooldown' then raise; end if; ok := false; end;
  perform pg_temp.logout();
  return ok;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare honest uuid := pg_temp.player(); cheat uuid; griefer uuid := pg_temp.player(); opp uuid; d jsonb := '{"desync":true}'; w jsonb := '{"score":[3,0],"duration":90}';
begin
  -- ehrlich gegen drei manipulierte Hosts (ungültig bzw. strittig mit desync): keine Pause (unter 5)
  perform pg_temp.game(pg_temp.player(), honest, 'void', d, d);
  perform pg_temp.game(pg_temp.player(), honest, 'disputed', w, d);
  perform pg_temp.game(pg_temp.player(), honest, 'disputed', w, d);
  assert pg_temp.can_rank(honest), 'drei desync-Spiele gegen verschiedene: keine Pause';
  -- drei strittige Spiele mit desync gegen denselben Gegner: zählen nicht als strittig (sonst Pause ab dispute_limit 3)
  honest := pg_temp.player(); cheat := pg_temp.player();
  for i in 1..3 loop perform pg_temp.game(cheat, honest, 'disputed', w, d); end loop;
  assert pg_temp.can_rank(honest), 'strittig mit desync zählt nicht';
  -- ohne desync dagegen weiter wie bisher: drei strittige Spiele, Pause
  honest := pg_temp.player();
  for i in 1..3 loop perform pg_temp.game(pg_temp.player(), honest, 'disputed', w, '{"score":[0,3],"duration":90}'); end loop;
  assert not pg_temp.can_rank(honest), 'strittig ohne desync: Pause wie bisher';
  -- 5 desync-Spiele gegen verschiedene Gegner: Pause, auch mit vielen ehrlichen Spielen (keine Quote mehr); 4 noch nicht
  cheat := pg_temp.player();
  for i in 1..20 loop perform pg_temp.game(cheat, pg_temp.player(), 'settled', w, w); end loop;
  for i in 1..4 loop perform pg_temp.game(cheat, pg_temp.player(), 'void', d, d); end loop;
  assert pg_temp.can_rank(cheat), '4 desync-Spiele: noch keine Pause';
  perform pg_temp.game(cheat, pg_temp.player(), 'disputed', d, w);
  assert not pg_temp.can_rank(cheat), '5 desync-Spiele gegen 5 Gegner: Pause';
  -- gegen nur 2 Gegner (oder einen mit zwei Konten): keine Pause, beliebig viele
  cheat := pg_temp.player(); honest := pg_temp.player(); griefer := pg_temp.player();
  for i in 1..10 loop perform pg_temp.game(cheat, case when i % 2 = 0 then honest else griefer end, 'disputed', d, w); end loop;
  assert pg_temp.can_rank(cheat) and pg_temp.can_rank(honest), '10 desync gegen nur 2 Gegner: keine Pause (mindestens 3)';
  -- offen (noch nicht entschieden) und abgerechnet zählen nicht
  cheat := pg_temp.player();
  for i in 1..5 loop perform pg_temp.game(cheat, pg_temp.player(), 'open', d, null); end loop;
  assert pg_temp.can_rank(cheat), 'offene Spiele zählen nicht';
  -- Casual zählt nicht, weder als desync-Spiel noch sonst
  cheat := pg_temp.player();
  for i in 1..6 loop perform pg_temp.game(cheat, pg_temp.player(), 'void', d, d, 'casual'); end loop;
  assert pg_temp.can_rank(cheat), 'desync in Casual: keine Ranked-Pause';
  for i in 1..5 loop perform pg_temp.game(cheat, pg_temp.player(), 'disputed', d, '{"score":[0,3],"duration":90}'); end loop;
  for i in 1..13 loop perform pg_temp.game(cheat, pg_temp.player(), 'settled', w, w, 'casual'); end loop;
  assert not pg_temp.can_rank(cheat), '5 desync in Ranked, Casual drumherum: Pause';
end $$;
rollback;

-- Wem „nicht synchron“ angelastet wird. Wer es ausgelöst hat, lässt sich nicht feststellen
-- (der Betrüger löst beim Ehrlichen „self“ aus und meldet selbst „peer“), also zählt jedes desync-Spiel für beide
-- Seiten; die Pause braucht 5 solche Spiele gegen 3 verschiedene Gegner. Gründe werden nur gespeichert.
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.player() returns uuid language plpgsql as $$
declare u uuid;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  update game.players set level = 6 where id = u;
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (u, 1, 1000, 10, 5);
  return u;
end $$;
create function pg_temp.game(a uuid, b uuid, st text, r1 jsonb, r2 jsonb) returns uuid language plpgsql as $$
declare m uuid;
begin
  insert into game.matches (p1, p2, mode, status, report1, report2, p1_started_at, p2_started_at, created_at)
  values (a, b, 'ranked', st, r1, r2, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour') returning id into m;
  return m;
end $$;
create function pg_temp.can_rank(u uuid) returns boolean language plpgsql as $$
declare ok boolean := true;
begin
  perform pg_temp.login(u);
  begin perform api.queue_join('ranked', 'head:kalle'); perform api.queue_leave();
  exception when others then if sqlerrm <> 'cooldown' then raise; end if; ok := false; end;
  perform pg_temp.logout();
  return ok;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;
do $$
declare victim uuid := pg_temp.player(); griefer uuid; silent uuid; v2 uuid := pg_temp.player(); x uuid; m uuid; r jsonb;
  c uuid[] := array[pg_temp.player(), pg_temp.player(), pg_temp.player()]; o uuid;
  peer jsonb := '{"desync":"peer"}'; self jsonb := '{"desync":"self"}'; w jsonb := '{"score":[1,0],"duration":90}';
begin
  -- b_victim: Opfer mit 40 ehrlichen Ranked-Spielen, 5-mal derselbe Griefer (bye desync, meldet nichts): keine Pause
  for i in 1..40 loop perform pg_temp.game(victim, pg_temp.player(), 'settled', w, w); end loop;
  griefer := pg_temp.player();
  for i in 1..5 loop perform pg_temp.game(griefer, victim, 'void', null, peer); end loop;
  assert pg_temp.can_rank(victim), 'Opfer (gleicher Griefer): keine Pause';
  assert pg_temp.can_rank(griefer), 'Griefer gegen nur einen Gegner: keine Pause';
  -- b_victim: Griefer macht 20 drohende Niederlagen gegen verschiedene Gegner ungültig und meldet nie: Pause
  griefer := pg_temp.player();
  for i in 1..20 loop perform pg_temp.game(griefer, pg_temp.player(), 'void', null, peer); end loop;
  assert not pg_temp.can_rank(griefer), 'Griefer (bye desync, schweigt): Pause';
  -- Schweiger: der Gegner erkennt selbst „nicht synchron“, er meldet nichts; 5 verschiedene Gegner: Pause
  silent := pg_temp.player();
  for i in 1..5 loop perform pg_temp.game(pg_temp.player(), silent, 'void', self, null); end loop;
  assert not pg_temp.can_rank(silent), 'Schweiger: Pause';
  -- frame: Opfer trifft 3 verschiedene Betrüger, die bei ihm „self“ auslösen und selbst „peer“ melden (über
  -- report_match): keine Pause, Gründe gespeichert, Spiele ungültig
  for i in 1..3 loop
    m := pg_temp.game(c[i], v2, 'open', null, null);
    perform pg_temp.login(v2); r := api.report_match(m, self); perform pg_temp.logout();
    perform pg_temp.login(c[i]); r := api.report_match(m, peer); perform pg_temp.logout();
    assert r->>'status' = 'void', 'frame: ungültig ' || r::text;
  end loop;
  assert (select string_agg(report1->>'desync' || '/' || (report2->>'desync'), ',') from game.matches where p2 = v2) = 'peer/self,peer/self,peer/self', 'Gründe gespeichert';
  assert pg_temp.can_rank(v2), 'Opfer von 3 Betrügern (3 Spiele): keine Pause';
  -- (Restrisiko, so dokumentiert: zwei weitere solche Spiele am selben Tag, und es bekäme auch die Pause)
  perform pg_temp.game(c[1], v2, 'void', peer, self); perform pg_temp.game(c[2], v2, 'void', peer, self);
  assert not pg_temp.can_rank(v2), 'Restrisiko: 5 desync-Spiele gegen 3 Betrüger';
  -- frame: Serienbetrüger macht so 20 drohende Niederlagen gegen verschiedene Gegner ungültig: Pause, obwohl er immer
  -- „peer“ meldet
  for i in 1..20 loop
    o := pg_temp.player(); m := pg_temp.game(c[3], o, 'open', null, null);
    perform pg_temp.login(o); r := api.report_match(m, self); perform pg_temp.logout();
    delete from game.rate_limits; perform pg_temp.login(c[3]); r := api.report_match(m, peer); perform pg_temp.logout();
  end loop;
  assert not pg_temp.can_rank(c[3]), 'Serienbetrüger („peer“): Pause';
  assert pg_temp.can_rank(o), 'sein letzter Gegner: keine Pause';
  -- alte Clients (desync: true) zählen genauso
  x := pg_temp.player();
  for i in 1..5 loop perform pg_temp.game(x, pg_temp.player(), 'void', '{"desync":true}', '{"desync":true}'); end loop;
  assert not pg_temp.can_rank(x), 'desync: true zählt';
end $$;
rollback;
