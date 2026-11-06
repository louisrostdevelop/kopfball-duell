-- Funde aus dem Sicherheits-Review (docs/BACKEND.md): jeder Angriff, der vorher ging, muss jetzt scheitern
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
create function pg_temp.cpu(won boolean, goals int, conceded int, dur int default 90, st jsonb default '{}', mode text default 'cpu') returns jsonb language sql as $$
  select jsonb_build_object('mode', mode, 'won', won, 'goals', goals, 'conceded', conceded, 'duration', dur, 'head', 'head:kalle', 'diff', 1, 'stats', st)
$$;
-- als Eigentümer (postgres), damit es auch angemeldet geht
create function pg_temp.sudo(q text) returns void language plpgsql security definer as $$ begin execute q; end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; v uuid; w uuid; x uuid; y uuid; r jsonb; c0 bigint; m uuid; i integer; n integer;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into v;

  -- C1: Zeitzone der Sitzung ändert "heute" nicht (vorher: Tagesbonus und Deckel per Header zurücksetzbar)
  perform pg_temp.login(u);
  set local timezone = 'Etc/GMT+12';
  perform api.claim_daily();
  set local timezone = 'Etc/GMT-14';
  perform pg_temp.expect_error('select api.claim_daily()', 'already_claimed');
  reset timezone;

  -- H1: Zeitkonto. Gemeldete Spielzeit kann nicht schneller vergehen als echte Zeit (hier mit 1800 s im Konto)
  perform pg_temp.sudo('delete from game.rate_limits');
  perform pg_temp.sudo(format('update game.progress set cpu_credit = 1800 where player_id = %L', u));
  n := 0;
  for i in 1..30 loop
    perform pg_temp.sudo('delete from game.rate_limits');
    begin
      perform api.report_cpu_match(pg_temp.cpu(true, 3, 0, 90), 'zeit-' || lpad(i::text, 8, '0'));
      n := n + 1;
    exception when others then
      if sqlerrm <> 'implausible' then raise; end if;
      exit;
    end;
  end loop;
  assert n between 18 and 25, 'Zeitkonto greift nach ~20 Spielen à 90 s: ' || n;
  -- Statistik muss zum Ergebnis passen
  perform pg_temp.sudo(format('update game.progress set cpu_credit = 1800 where player_id = %L', u));
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu(false, 0, 2, 90, '{"headGoals": 999}'), 'stat-0001')$q$, 'implausible');
  -- Training bringt nichts (vorher: XP, Pass-Punkte, Kopf-XP ohne Grenze)
  r := api.report_cpu_match(pg_temp.cpu(false, 0, 0, 60, '{}', 'train'), 'train-0001');
  assert (r->>'xp')::int = 0 and (r->>'coins')::int = 0 and (r->>'headXp')::int = 0, 'Training ohne Belohnung: ' || r::text;
  perform pg_temp.logout();
  -- Tagesgrenze belohnter Spiele
  update game.progress set cap_matches = 80, cap_day = game.today(), cpu_credit = 1800 where player_id = u;
  perform pg_temp.login(u); perform pg_temp.sudo('delete from game.rate_limits');
  r := api.report_cpu_match(pg_temp.cpu(true, 2, 0, 60), 'limit-0001');
  assert (r->>'capReached')::boolean and (r->>'xp')::int = 0, 'nach 80 Spielen nichts mehr';
  perform pg_temp.logout();

  -- H2: Import nur in den ersten 24 h, Gegenstände + Münzen zusammen gedeckelt
  update game.players set created_at = now() - interval '2 days' where id = v;
  perform pg_temp.login(v);
  perform pg_temp.expect_error($q$select api.import_local('{"coins": 5000, "chars": ["kaiser"]}')$q$, 'import_too_late');
  perform pg_temp.logout();

  -- H3: Online. Zu frühe Meldung ungültig; das Paar bringt nach 5 Spielen in 24 h keine Münzen mehr
  for i in 1..6 loop
    insert into game.matches (mode, p1, p2, heads, created_at) values ('casual', u, v, '{"p1":{"head":"head:kalle"},"p2":{"head":"head:kalle"}}', now() - interval '5 minutes') returning id into m;
    perform pg_temp.sudo('delete from game.rate_limits');
    perform pg_temp.login(u); perform api.report_match(m, '{"score":[2,0],"duration":90}'); perform pg_temp.logout();
    perform pg_temp.login(v); r := api.report_match(m, '{"score":[2,0],"duration":90}'); perform pg_temp.logout();
  end loop;
  assert r->>'status' = 'settled' and not (r->'result'->'rewarded'->>'p1')::boolean, '6. Spiel desselben Paars ohne Belohnung: ' || r::text;
  assert (select count(*) from game.ledger where player_id = u and reason = 'match_casual') = 5, 'nur 5 belohnte Spiele';

  -- H4: Aufgeben/Abhauen bringt nichts. Nur eine Seite meldet "Gegner weg" -> nach der Wartezeit gewinnt sie
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into w;
  insert into game.matches (mode, p1, p2, heads, created_at) values ('casual', w, u, '{"p1":{"head":"head:kalle"},"p2":{"head":"head:kalle"}}', now() - interval '10 minutes') returning id into m;
  perform pg_temp.sudo('delete from game.rate_limits');
  perform pg_temp.login(u); r := api.report_match(m, '{"score":[1,0],"duration":40,"forfeit":true}'); perform pg_temp.logout();
  assert r->>'status' = 'waiting', 'wartet auf die andere Seite';
  update game.matches set report2 = jsonb_set(report2, '{at}', to_jsonb(now() - interval '5 minutes')) where id = m;
  perform game.maintenance();
  assert (select status from game.matches where id = m) = 'settled', 'einseitig gemeldet: gewertet';
  assert (select (result->>'winner')::int from game.matches where id = m) = 2, 'wer geblieben ist, gewinnt (auch bei 1:0 für den anderen)';

  -- M6: Zweitkonten. Sieg gegen ein neues Konto bringt nur anteilig Wertung, der Verlierer verliert voll
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into x;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into y;
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (x, game.current_season(), 1000, 20, 10), (y, game.current_season(), 1000, 2, 0);
  insert into game.matches (mode, p1, p2, heads, season_id, created_at) values ('ranked', x, y, '{"p1":{"head":"head:kalle"},"p2":{"head":"head:kalle"}}', game.current_season(), now() - interval '5 minutes') returning id into m;
  r := game.settle(m, '[3,0]');
  assert (r->'result'->'mmr'->>'p1')::int = 3 and (r->'result'->'mmr'->>'p2')::int = -16, 'Sieg gegen Neuling: 2/10 von 16: ' || r::text;
  insert into game.matches (mode, p1, p2, heads, season_id, created_at) values ('ranked', y, x, '{"p1":{"head":"head:kalle"},"p2":{"head":"head:kalle"}}', game.current_season(), now() - interval '5 minutes') returning id into m;
  r := game.settle(m, '[0,1]');
  assert (r->'result'->'mmr'->>'p2')::int between 4 and 6 and (r->'result'->'mmr'->>'p1')::int < -10, 'Neuling hat jetzt 3 Spiele: ' || r::text;
  r := game.settle((select id from game.matches where p1 = y and p2 = x), '[0,1]');
  assert r->>'status' = 'settled', 'schon abgerechnet: bleibt';

  -- Viele strittige Spiele: Ranked-Pause, Casual geht weiter
  update game.players set level = 10 where id = u;
  for i in 1..3 loop
    insert into game.matches (mode, p1, p2, heads, status, report1, report2) values ('ranked', u, v, '{}', 'disputed', '{"score":[1,0]}', '{"score":[0,1]}');
  end loop;
  perform pg_temp.login(u); perform pg_temp.sudo('delete from game.rate_limits');
  perform pg_temp.expect_error($q$select api.queue_join('ranked', 'head:kalle')$q$, 'cooldown');
  perform api.queue_join('casual', 'head:kalle'); perform api.queue_leave();
  perform pg_temp.logout();
  update game.matches set created_at = now() - interval '13 hours' where status = 'disputed' and p1 = u;
  perform pg_temp.login(u); perform api.queue_join('ranked', 'head:kalle'); perform api.queue_leave(); perform pg_temp.logout();

  -- H5: Rückbuchung holt alles zurück, was der Kauf gebracht hat (Juwelen-Schuld, Pass, Gegenstände)
  set local role service_role;
  perform api.grant_purchase(w, 'stripe', 'pi_review_1', 'gems_550', 499, 'EUR');
  perform api.grant_purchase(w, 'stripe', 'pi_review_2', 'premium_pass', 499, 'EUR');
  reset role;
  perform game.book(w, 'gems', -500, 'test');
  set local role service_role;
  r := api.refund_purchase('stripe', 'pi_review_1');
  perform api.refund_purchase('stripe', 'pi_review_2');
  perform pg_temp.expect_error($q$select api.grant_purchase('$q$ || w || $q$', 'stripe', 'pi_review_3', 'gems_100', 99, 'USD')$q$, 'amount_mismatch');
  reset role;
  assert (r->>'clawedBack')::int = 50 and (r->>'debt')::int = 500, 'Rest wird Schuld: ' || r::text;
  assert not (select premium from game.pass_progress where player_id = w and season_id = game.current_season()), 'Pass entzogen';
  perform game.book(w, 'gems', 120, 'test');
  assert (select gems from game.wallets where player_id = w) = 0 and (select gem_debt from game.wallets where player_id = w) = 380, 'neue Juwelen tilgen die Schuld';
  assert (select chargebacks from game.players where id = w) = 2, 'Konto markiert';

  -- M1/M3: Plätze auf Seite 2 stimmen; gelöschte Spieler verschwinden aus den Rang-Zählern
  perform game.put_score(u, 'endless', 30); perform game.put_score(v, 'endless', 20); perform game.put_score(w, 'endless', 10);
  r := api.leaderboard('endless', 'all', 1, 1);
  assert (r->0->>'rank')::int = 2, 'Platz auf Seite 2: ' || r::text;
  delete from auth.users where id = u;
  perform game.put_score(w, 'endless', 9);
  perform pg_temp.login(v);
  assert (api.my_rank('endless')->>'rank')::int = 1, 'nach Löschen von Platz 1 ist v Erster';
  -- M2: Nachbarn in der Bestenliste nach Zahl, nicht nach Text sortiert
  r := api.leaderboard_around('endless', 'all', 3);
  assert (r->0->>'score')::int = 20 and (r->0->>'me')::boolean, 'v oben: ' || r::text;
  perform pg_temp.logout();

  -- Low: fill_with_gems = null gibt keine Juwelen aus
  perform pg_temp.login(v);
  perform pg_temp.expect_error($q$select api.upgrade_head('head:yuki', null, 'upgrade-null-1')$q$, 'not_enough_head_xp');
  -- M9: Konto löschen
  perform pg_temp.expect_error($q$select api.delete_account('ja')$q$, 'confirm_required');
  perform api.delete_account('DELETE');
  perform pg_temp.logout();
  assert not exists (select 1 from auth.users where id = v) and exists (select 1 from game.erasures where user_id = v), 'Konto weg, Löschung vermerkt';
end $$;
rollback;
