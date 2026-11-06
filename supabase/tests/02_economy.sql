-- Wirtschaft: Start, Tagesbonus, Kaufen, Doppelt-Schutz, Computer-Spiele mit Deckel, Kopf-Level, Import, Namen
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
-- Spiel mit Standardwerten
create function pg_temp.cpu(mode text, won boolean, goals int, conceded int, head text default 'head:kalle', diff int default 1, dur int default 90) returns jsonb language sql as $$
  select jsonb_build_object('mode', mode, 'won', won, 'goals', goals, 'conceded', conceded, 'duration', dur, 'head', head, 'diff', diff)
$$;

-- Hilfen dürfen auch als Spieler laufen (Funktionen sind sonst standardmäßig gesperrt)
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; v uuid; s jsonb; r jsonb; r2 jsonb; c0 bigint;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into u;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into v;
  perform pg_temp.login(u);

  -- Start
  s := api.me();
  assert (s->>'coins')::int = 150, 'Startmünzen';
  assert s->'items' ? 'head:kalle' and s->'items' ? 'ball:klassik', 'Startgegenstände';
  assert (s->'heads'->'head:kalle'->>'level')::int = 1, 'Kopf-Level 1';
  assert (s->>'guest')::boolean, 'Gast';

  -- Tagesbonus genau einmal
  r := api.claim_daily();
  assert (r->>'amount')::int = 70 and (r->>'streak')::int = 1, 'Tagesbonus Tag 1';
  perform pg_temp.expect_error('select api.claim_daily()', 'already_claimed');

  -- Kaufen: Legendäres erst ab Level 10, zu teuer, dann genug Münzen
  perform pg_temp.expect_error('select api.buy_item(''head:kaiser'', ''coins'', ''key-kaiser-1'')', 'level_required');
  perform pg_temp.expect_error('select api.buy_item(''head:max'', ''coins'', ''key-max-0001'')', 'level_required');
  perform pg_temp.expect_error('select api.buy_item(''head:rocco'', ''coins'', ''key-rocco-00'')', 'insufficient_funds');
  perform pg_temp.logout(); perform game.book(u, 'coins', 200, 'test'); perform pg_temp.login(u);
  perform pg_temp.expect_error('select api.buy_item(''head:kalle'', ''coins'', ''key-kalle-01'')', 'already_owned');
  perform pg_temp.expect_error('select api.buy_item(''head:nope'', ''coins'', ''key-nope-001'')', 'unknown_item');
  perform pg_temp.expect_error('select api.buy_item(''ball:retro'', ''gems'', ''key-retro-01'')', 'not_for_sale');
  r := api.buy_item('head:rocco', 'coins', 'key-rocco-01');
  assert (r->'state'->>'coins')::int = 20, 'Rocco 400 Münzen';
  assert r->'state'->'heads' ? 'head:rocco', 'Rocco hat Level-Eintrag';
  -- Gleiche Anfrage nochmal (Netz-Wiederholung): kein zweites Abbuchen, gleiche Antwort
  r2 := api.buy_item('head:rocco', 'coins', 'key-rocco-01');
  assert r2 = r, 'Wiederholung liefert gleiche Antwort';
  assert (api.me()->>'coins')::int = 20, 'nur einmal abgebucht';
  perform pg_temp.expect_error('select api.buy_item(''head:rocco'', ''coins'', ''short'')', 'bad_request_key');

  -- Computer-Spiel: Belohnung vom Server
  c0 := (api.me()->>'coins')::int;
  r := api.report_cpu_match(pg_temp.cpu('cpu', true, 3, 0), 'match-key-0001');
  -- Sieg Normal: round(40*1.3)=52 + 3 Tore*8 + zu null 20 = 96
  assert (r->>'coins')::int = 96, 'Münzen Sieg: ' || (r->>'coins');
  -- dazu Level 2 (+70) und Erfolge erster Sieg (50), zu null (80), Hattrick (80)
  assert (r->'state'->>'coins')::int = c0 + 96 + 70 + 50 + 80 + 80, 'Münzen inkl. Level und Erfolge: ' || (r->'state'->>'coins');
  assert (r->'levelUps')::text = '[2]', 'Level-Aufstieg';
  assert r->'achievements' ? 'firstwin' and r->'achievements' ? 'cleansheet' and r->'achievements' ? 'hattrick', 'Erfolge: ' || (r->'achievements')::text;
  assert (r->'state'->'heads'->'head:kalle'->>'xp')::int = 30, 'Kopf-XP';
  assert (api.me()->'stats'->>'wins')::int = 1, 'Statistik';
  -- unplausible Meldungen
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu('cpu', true, 3, 0, 'head:kalle', 1, 5), 'match-key-0002')$q$, 'implausible');
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu('cpu', true, 1, 2), 'match-key-0003')$q$, 'implausible');
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu('cpu', true, 3, 0, 'head:kaiser'), 'match-key-0004')$q$, 'head_not_owned');
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu('online', true, 3, 0), 'match-key-0005')$q$, 'bad_mode');
  perform pg_temp.expect_error($q$select api.report_cpu_match(pg_temp.cpu('cpu', true, 3, 0, 'head:kalle', 9), 'match-key-0006')$q$, 'implausible');
  -- Wiederholte Meldung zählt nicht doppelt
  r2 := api.report_cpu_match(pg_temp.cpu('cpu', true, 3, 0), 'match-key-0001');
  assert r2 = r, 'gleiche Spielmeldung nur einmal';

  -- Tagesdeckel: nach 600 Münzen nur noch 20 %
  perform pg_temp.logout();
  update game.progress set cap_day = game.today(), cap_cpu_coins = 590 where player_id = u;
  delete from game.rate_limits where player_id = u;
  perform pg_temp.login(u);
  r := api.report_cpu_match(pg_temp.cpu('cpu', true, 1, 0, 'head:kalle', 0), 'match-key-0007');
  -- Sieg Locker 40 + 1 Tor 8 + zu null 20 = 68, davon 10 voll + 58 * 0.2 = 22
  assert (r->>'coins')::int = 22 and (r->>'coinsBeforeCap')::int = 68, 'Deckel: ' || r::text;
  -- Harte Grenze: nichts mehr, auch keine XP
  perform pg_temp.logout();
  update game.progress set cap_cpu_coins = 1500 where player_id = u;
  perform pg_temp.login(u);
  r := api.report_cpu_match(pg_temp.cpu('cpu', true, 1, 0), 'match-key-0008');
  assert (r->>'coins')::int = 0 and (r->>'xp')::int = 0 and (r->>'headXp')::int = 0 and (r->>'capReached')::boolean, 'harte Grenze: ' || r::text;
  perform pg_temp.logout();
  update game.progress set cap_cpu_coins = 612 where player_id = u;
  update game.heads set xp = 60 where player_id = u and head_id = 'head:kalle';
  perform pg_temp.login(u);

  -- Kopf-Level: zu wenig Kopf-XP, mit Juwelen auffüllen, Münzen nötig
  perform pg_temp.expect_error('select api.upgrade_head(''head:kalle'', false, ''upgrade-key-01'')', 'not_enough_head_xp');
  perform pg_temp.expect_error('select api.upgrade_head(''head:kalle'', true, ''upgrade-key-02'')', 'insufficient_funds');
  perform pg_temp.logout();
  perform game.book(u, 'gems', 100, 'test');
  perform pg_temp.login(u);
  r := api.upgrade_head('head:kalle', true, 'upgrade-key-03');
  -- 100 XP nötig, 60 da (2 Siege à 30) -> 40 fehlen = 4 Juwelen; 200 Münzen
  assert (r->>'level')::int = 2 and (r->>'gems')::int = 4 and (r->>'coins')::int = 200, 'Upgrade: ' || r::text;
  assert (r->'state'->>'gems')::int = 96, 'Juwelen abgebucht';
  perform pg_temp.expect_error('select api.upgrade_head(''head:kaiser'', true, ''upgrade-key-04'')', 'head_not_owned');

  -- Namen
  perform api.set_name('Louis');
  assert api.me()->>'name' = 'Louis', 'Name gesetzt';
  perform pg_temp.expect_error('select api.set_name(''ab'')', 'name_length');
  perform pg_temp.expect_error('select api.set_name(''Lou is'')', 'name_chars');
  perform pg_temp.logout();
  perform pg_temp.login(v);
  perform pg_temp.expect_error('select api.set_name(''LOUIS'')', 'name_taken');
  perform api.set_name('Kumpel');

  -- Import des Browser-Spielstands: einmal, gedeckelt, nur Münz-Inhalte
  r := api.import_local('{"coins": 99999, "chars": ["kalle","tank","gibtsnicht"], "balls": ["gold"], "arenas": ["mond"]}');
  -- Budget 2000: Tank 750 + Gold 600 + Mond 600 = 1950, Rest 50 als Münzen
  assert (r->>'coins')::int = 150 + 50, 'Import gedeckelt (Gegenstände + Münzen zusammen): ' || (r->>'coins');
  assert r->'items' ? 'head:tank' and r->'items' ? 'ball:gold' and r->'items' ? 'arena:mond', 'Import Gegenstände';
  perform pg_temp.expect_error('select api.import_local(''{}'')', 'already_imported');

  -- Saison-Pass: Punkte aus Spielen, Stufen abholen
  r := api.report_cpu_match(pg_temp.cpu('cpu', false, 1, 3, 'head:tank'), 'match-key-v001');
  assert (r->'state'->>'passPoints')::int = 5 and (api.me()->'season'->'pass'->>'points')::int = 5, 'Pass-Punkte';
  r := api.claim_pass(0, false);
  assert jsonb_typeof(r->'season'->'tiers') = 'array' and (r->'season'->'pass'->>'free')::int = 1, 'Stufen im Zustand, Stufe 0 abgeholt';
  perform pg_temp.expect_error('select api.claim_pass(0, false)', 'already_claimed');
  perform pg_temp.expect_error('select api.claim_pass(0, true)', 'no_premium');
  perform pg_temp.expect_error('select api.claim_pass(1, false)', 'not_reached');
  perform pg_temp.expect_error('select api.buy_pass_with_gems(''pass-key-0001'')', 'insufficient_funds');

  -- Einstellungen: nur Objekte, begrenzte Größe
  perform api.set_prefs('{"sfx": false}');
  perform pg_temp.expect_error('select api.set_prefs(''[]'')', 'bad_prefs');
  perform pg_temp.expect_error($q$select api.set_prefs(jsonb_build_object('x', repeat('a', 9000)))$q$, 'prefs_too_large');
  perform pg_temp.logout();

  -- Buchungen ergeben exakt den Kontostand
  assert (select coins from game.wallets where player_id = u) = (select sum(delta) from game.ledger where player_id = u and currency = 'coins'), 'Ledger = Kontostand (Münzen)';
  assert (select gems from game.wallets where player_id = u) = (select sum(delta) from game.ledger where player_id = u and currency = 'gems'), 'Ledger = Kontostand (Juwelen)';
  assert not exists (select 1 from game.ledger l join game.wallets w on w.player_id = l.player_id where l.id = (select max(id) from game.ledger l2 where l2.player_id = l.player_id and l2.currency = l.currency) and l.balance_after <> case l.currency when 'coins' then w.coins else w.gems end), 'letzter Stand im Ledger = Wallet';
end $$;
rollback;
