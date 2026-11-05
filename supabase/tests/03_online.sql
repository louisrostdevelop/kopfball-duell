-- Online: Warteschlange, Paarung, Ergebnis beider Seiten, Wertung, Bestenlisten, Freunde, Kanäle
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.expect_error(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlstate <> want and sqlerrm <> want then raise exception 'ASSERT: falscher Fehler bei % -> % %', stmt, sqlstate, sqlerrm; end if;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; g uuid; ma jsonb; mb jsonb; m uuid; r jsonb; host uuid; guest uuid;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into b;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into g;
  update game.players set name = 'Anna' where id = a;
  update game.players set name = 'Ben' where id = b;

  -- Freischaltung nach Level und Konto
  perform pg_temp.login(g);
  perform pg_temp.expect_error('select api.queue_join(''casual'', ''head:kalle'')', 'level_required');
  perform pg_temp.logout();
  update game.players set level = 5 where id in (a, b, g);
  perform pg_temp.login(g);
  perform pg_temp.expect_error('select api.queue_join(''ranked'', ''head:kalle'')', 'account_required');
  perform api.queue_join('casual', 'head:kalle');
  perform api.queue_leave();
  perform pg_temp.expect_error('select api.queue_join(''ranked'', ''head:kaiser'')', 'account_required');
  perform pg_temp.logout();

  -- Zwei Konten suchen Ranked und finden sich
  perform pg_temp.login(a); perform api.queue_join('ranked', 'head:kalle');
  perform pg_temp.expect_error('select api.queue_join(''ranked'', ''head:kaiser'')', 'head_not_owned');
  ma := api.queue_poll();
  assert not (ma->>'matched')::boolean, 'allein: kein Gegner';
  perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join('ranked', 'head:yuki');
  mb := api.queue_poll();
  assert (mb->>'matched')::boolean, 'gepaart';
  perform pg_temp.logout();
  perform pg_temp.login(a); ma := api.queue_poll(); perform pg_temp.logout();
  assert ma->>'match' = mb->>'match', 'gleiches Spiel für beide';
  assert ma->>'role' = 'host' and mb->>'role' = 'guest', 'wer länger wartet, hostet';
  assert ma->'opponent'->>'name' = 'Ben' and mb->'opponent'->>'name' = 'Anna', 'Gegnername';
  assert ma->'heads'->'p1'->>'head' = 'head:kalle' and (ma->'heads'->'p1'->>'level')::int = 1, 'Kopfwerte vom Server';
  m := (ma->>'match')::uuid;

  -- Fremde dürfen nicht melden
  perform pg_temp.login(g);
  perform pg_temp.expect_error(format('select api.report_match(%L, ''{"score":[3,1],"duration":90,"inputs":"x"}'')', m), 'unknown_match');
  assert not api.can_use_channel('match:' || m), 'Fremder kommt nicht in den Spielkanal';
  assert api.can_use_channel('user:' || g), 'eigener Kanal';
  assert not api.can_use_channel('user:' || a), 'fremder Nutzerkanal';
  perform pg_temp.logout();

  -- Beide melden dasselbe -> abgerechnet: Anna (Host) gewinnt 3:1
  perform pg_temp.login(a);
  assert api.can_use_channel('match:' || m), 'Spieler im Spielkanal';
  perform pg_temp.expect_error(format('select api.report_match(%L, ''{"score":[3,1],"duration":3,"inputs":"h"}'')', m), 'bad_report');
  r := api.report_match(m, '{"score":[3,1],"duration":90,"inputs":"h1"}');
  assert r->>'status' = 'waiting', 'wartet auf die andere Seite';
  perform pg_temp.expect_error(format('select api.report_match(%L, ''{"score":[3,1],"duration":90,"inputs":"h1"}'')', m), 'already_reported');
  perform pg_temp.logout();
  perform pg_temp.login(b);
  r := api.report_match(m, '{"score":[3,1],"duration":90,"inputs":"h1"}');
  assert r->>'status' = 'settled' and (r->'result'->>'winner')::int = 1, 'abgerechnet: ' || r::text;
  assert (r->'result'->>'mmrDelta')::int = 16, 'Elo gleich starker Gegner: +16';
  perform pg_temp.logout();
  assert (select mmr from game.ratings where player_id = a) = 1016 and (select mmr from game.ratings where player_id = b) = 984, 'Wertung';
  assert not exists (select 1 from game.match_queue where player_id in (a, b)), 'Warteschlange geleert';
  assert (select sum(delta) from game.ledger where player_id = a and reason = 'match_ranked') = 70, 'Münzen Sieger';
  assert (select sum(delta) from game.ledger where player_id = b and reason = 'match_ranked') = 25, 'Münzen Verlierer';
  assert exists (select 1 from game.ledger where player_id = a and reason = 'achievement' and ref = 'online'), 'Erfolg Online-König';

  -- Widersprüchliche Meldungen -> strittig, Prüfdienst entscheidet
  delete from game.rate_limits;
  insert into game.matches (mode, season_id, p1, p2, heads) values ('casual', null, a, b, '{"p1":{"head":"head:kalle","level":1},"p2":{"head":"head:yuki","level":1}}') returning id into m;
  perform pg_temp.login(a); perform api.report_match(m, '{"score":[2,0],"duration":90,"inputs":"aa"}'); perform pg_temp.logout();
  perform pg_temp.login(b); r := api.report_match(m, '{"score":[0,2],"duration":90,"inputs":"bb"}'); perform pg_temp.logout();
  assert r->>'status' = 'disputed', 'strittig';
  set local role service_role;
  r := api.settle_match(m, '[0,2]');
  reset role;
  assert r->>'status' = 'settled' and (r->'result'->>'winner')::int = 2, 'Prüfdienst entscheidet';

  -- Bestenliste
  perform pg_temp.login(a);
  perform pg_temp.expect_error('select api.submit_score(''endless'', 5)', 'implausible');
  perform api.submit_score('daily', 120);
  perform api.submit_score('daily', 80);   -- schlechter: zählt nicht
  perform pg_temp.logout();
  perform pg_temp.login(b); perform api.submit_score('daily', 150); perform pg_temp.logout();
  set local role anon;
  r := api.leaderboard('daily', 'all', 10, 0);
  reset role;
  assert r->0->>'name' = 'Ben' and (r->1->>'score')::int = 120, 'Rangliste: ' || r::text;
  perform pg_temp.login(a);
  assert (api.my_rank('daily')->>'rank')::int = 2, 'eigener Rang';
  -- Freunde: Anfrage, Gegenanfrage = Freundschaft
  assert api.friend_request('ben')->>'status' = 'pending', 'Anfrage';
  perform pg_temp.expect_error('select api.friend_request(''niemand'')', 'unknown_player');
  perform pg_temp.logout();
  perform pg_temp.login(b);
  assert api.friends()->'incoming' ? 'Anna', 'Anfrage sichtbar';
  assert api.friend_request('Anna')->>'status' = 'accepted', 'angenommen';
  assert jsonb_array_length(api.friends()->'friends') = 1, 'Freundesliste';
  perform pg_temp.logout();
end $$;
rollback;
