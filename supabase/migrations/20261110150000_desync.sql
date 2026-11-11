-- =====================================================================================
-- Gegnersuche: Spiel „nicht synchron“. In der Gegnersuche übernimmt der Gast keine
-- Korrektur des Hosts mehr: weicht die Rechnung ab (Prüfsumme), gibt der Host einen Stand vor oder schickt er mitten im
-- Spiel Unerwartetes, melden beide Seiten report_match mit { desync: Grund } statt eines Ergebnisses. Grund: „self“
-- (selbst erkannt) oder „peer“ (die Gegenseite hat es gemeldet, bye desync); true (alte Clients) gilt als „self“.
--  - beide „nicht synchron“: das Spiel ist ungültig (void: keine Wertung, keine Aufgabe, keine Belohnung)
--  - eine Seite „nicht synchron“, die andere ein Ergebnis: strittig (disputed, wie zwei verschiedene Ergebnisse)
--  - nur eine Seite meldet „nicht synchron“, die andere gar nichts: verfällt nach forfeit_after_secs (Wartung)
--  - Ranked-Pause: Spiele mit „nicht synchron“ zählen nicht mehr zu den strittigen; eigene Regel für den, der
--    auffällig viele solche Spiele hat (api.queue_join, game.desync_game). Der Grund wird nur gespeichert.
-- Echte Rechenfehler gibt es praktisch nicht (Gegenprobe V8/QuickJS, tests/sim/determinism.test.mjs); ehrliche Spiele
-- landen hier also kaum.
-- =====================================================================================

-- Meldung „nicht synchron“: Grund „self“ oder „peer“, sonst null (auch für eine fehlende Meldung)
create or replace function game.desync_of(r jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when r is null or jsonb_typeof(r) <> 'object' then null
              when r->'desync' = 'true'::jsonb or r->'desync' = '"self"'::jsonb then 'self'
              when r->'desync' = '"peer"'::jsonb then 'peer' end
$$;
revoke all on function game.desync_of(jsonb) from public, anon, authenticated;

-- Spiel „nicht synchron“ (für die Ranked-Pause): ungültig, verfallen oder strittig, mit mindestens einer
-- desync-Meldung. Zählt für BEIDE Seiten: wer es ausgelöst hat, lässt sich nicht feststellen (der Grund „self“/„peer“
-- kommt vom Client, ein Betrüger kann beim Ehrlichen „self“ auslösen und selbst „peer“ melden). Der Grund wird nur
-- gespeichert (spätere Auswertung).
create or replace function game.desync_game(r1 jsonb, r2 jsonb, st text) returns boolean
language sql immutable set search_path = '' as $$
  select st in ('void', 'disputed', 'review') and (game.desync_of(r1) is not null or game.desync_of(r2) is not null)
$$;
revoke all on function game.desync_game(jsonb, jsonb, text) from public, anon, authenticated;

-- Wie 20261109120000_review_fixes.sql, dazu r.desync
create or replace function api.report_match(match uuid, r jsonb) returns jsonb
-- r: { score: [host, gast], duration: s, forfeit?: true (Gegner ist mitten im Spiel weg) } oder { desync: "self" | "peer" }
-- Gewertet wird, wenn beide dasselbe melden; meldet nur einer, gilt seine Meldung nach forfeit_after_secs (Wartung).
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches; mine jsonb; theirs jsonb; side integer; dur integer := coalesce((r->>'duration')::integer, 0);
  why text := game.desync_of(r); ds boolean := why is not null;
begin
  perform game.limit_rate(p, 'report_match', 10, interval '1 minute');
  if jsonb_typeof(r) = 'object' and r ? 'desync' and not ds and r->'desync' <> 'false'::jsonb then perform game.fail('bad_report', 'desync'); end if;
  if not ds then
    if jsonb_typeof(r->'score') <> 'array' or jsonb_array_length(r->'score') <> 2 then perform game.fail('bad_report'); end if;
    if (r->'score'->>0)::integer not between 0 and 50 or (r->'score'->>1)::integer not between 0 and 50 then perform game.fail('bad_report'); end if;
    if dur not between 10 and 900 then perform game.fail('bad_report', 'duration'); end if;
    -- Tore passen zur Dauer (wie bei Computer-Spielen): 50:0 in 30 Sekunden ist eine Absprache, kein Spiel
    if (r->'score'->>0)::integer + (r->'score'->>1)::integer > dur / 3 + 2 then perform game.fail('implausible', 'goal_rate'); end if;
  end if;
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status <> 'open' then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  -- Ein Spiel kann nicht schneller vorbei sein, als es gedauert hat (Schutz vor Absprachen im Sekundentakt)
  if not ds and now() - mt.created_at < make_interval(secs => greatest(game.cfg_int('online_min_secs'), dur * 0.8)) and not coalesce((r->>'forfeit')::boolean, false) then
    perform game.fail('implausible', 'too_early');
  end if;
  -- „Gegner weg“ zählt nur nach einem echten Anpfiff: beide haben ihn gemeldet, und seitdem sind mindestens 10 s vergangen
  -- (sonst ließe sich sofort nach dem Paaren melden, ohne je zu verbinden, und nach 3 min als Sieger gewertet werden)
  if not ds and coalesce((r->>'forfeit')::boolean, false)
     and (mt.p1_started_at is null or mt.p2_started_at is null or now() - greatest(mt.p1_started_at, mt.p2_started_at) < interval '10 seconds') then
    perform game.fail('implausible', 'forfeit_unstarted');
  end if;
  side := case when mt.p1 = p then 1 else 2 end;
  mine := case when ds then jsonb_build_object('desync', why, 'at', now())
               else jsonb_build_object('score', r->'score', 'duration', dur, 'forfeit', coalesce((r->>'forfeit')::boolean, false), 'at', now()) end;
  if side = 1 then
    if mt.report1 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report1 = mine where id = match; theirs := mt.report2;
  else
    if mt.report2 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report2 = mine where id = match; theirs := mt.report1;
  end if;
  delete from game.match_queue where player_id = p and match_id = match;
  if theirs is null then return jsonb_build_object('status', 'waiting'); end if;
  -- beide „nicht synchron“: ungültig
  if ds and game.desync_of(theirs) is not null then
    update game.matches set status = 'void', settled_at = now() where id = match;
    return jsonb_build_object('status', 'void');
  end if;
  if not ds and game.desync_of(theirs) is null
     and theirs->'score' = mine->'score' and (theirs->>'forfeit')::boolean is not distinct from (mine->>'forfeit')::boolean then
    return game.settle(match, mine->'score', null);
  end if;
  update game.matches set status = 'disputed' where id = match;
  return jsonb_build_object('status', 'disputed');
end $$;

-- Wie 20261110120000_night.sql, dazu: einseitig „nicht synchron“ wird nicht als Ergebnis gewertet, sondern verfällt
create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer := 0; c integer; d integer; e integer; f integer; g integer; h integer; se integer; m record; rep jsonb; side integer;
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
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f, 'oldMatches', h);
end $$;

-- Wie 20261110120000_night.sql, dazu die Ranked-Pause ohne „nicht synchron“ und eine eigene Regel dafür
create or replace function api.queue_join(queue_mode text, head text, cos jsonb default null, client_version integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); lvl integer; anon boolean; s integer := game.current_season(); disputes integer; last_dispute timestamptz;
  desyncs integer; desync_games integer; last_desync timestamptz;
begin
  perform game.limit_rate(p, 'queue_join', 20, interval '1 minute');
  if queue_mode not in ('ranked', 'casual') then perform game.fail('bad_mode'); end if;
  if client_version is not null and client_version not between 1 and 1000000 then perform game.fail('bad_version'); end if;
  select level into lvl from game.players where id = p;
  select is_anonymous into anon from auth.users where id = p;
  if queue_mode = 'ranked' then
    if coalesce(anon, true) then perform game.fail('account_required'); end if;
    if lvl < game.cfg_int('ranked_min_level') then perform game.fail('level_required', game.cfg_int('ranked_min_level')::text); end if;
    if s is null then perform game.fail('no_season'); end if;
    -- Viele strittige Spiele (beide haben gemeldet, Ergebnisse passen nicht zusammen): Ranked-Pause.
    -- Spiele mit „nicht synchron“ zählen hier nicht (sonst bekäme die ehrliche Seite eines manipulierten Hosts die Pause).
    select count(*), max(created_at) into disputes, last_dispute from (
      select created_at, status, report1, report2 from game.matches where p1 = p and created_at > now() - interval '24 hours'
      union all
      select created_at, status, report1, report2 from game.matches where p2 = p and created_at > now() - interval '24 hours') x
     where (status = 'disputed' or (status = 'void' and report1 is not null and report2 is not null))
       and game.desync_of(report1) is null and game.desync_of(report2) is null;
    if disputes >= game.cfg_int('dispute_limit') and last_dispute > now() - make_interval(hours => game.cfg_int('dispute_cooldown_hours')) then
      perform game.fail('cooldown');
    end if;
    -- „Nicht synchron“: ehrlich praktisch nie (beide rechnen bitgleich). Wer es auslöst, macht ein Spiel ungültig (z. B.
    -- eine drohende Niederlage, mit einem manipulierten Client). Wer es war, lässt sich nicht feststellen: jedes solche
    -- Spiel zählt für beide Seiten (game.desync_game), nur in Ranked. Pause ab 5 solchen Spielen in 24 h gegen
    -- mindestens 3 verschiedene Gegner. Die verschiedenen Gegner schützen vor einem einzelnen Gegner (oder einem
    -- Betrüger mit zwei Konten), der einem solche Spiele anhängt; ein Serienbetrüger trifft ständig neue Gegner.
    -- Restrisiko: wer an einem Tag fünfmal gegen mindestens 3 verschiedene Betrüger spielt, bekommt auch die Pause.
    -- Ein manipulierter Host gewinnt dabei nichts: meldet er ein Ergebnis, ist das Spiel strittig, sonst ungültig.
    select count(distinct opp) filter (where ds), count(*) filter (where ds), max(created_at) filter (where ds)
      into desyncs, desync_games, last_desync from (
      select created_at, p2 as opp, game.desync_game(report1, report2, status) as ds from game.matches
       where p1 = p and mode = 'ranked' and created_at > now() - interval '24 hours' and p1_started_at is not null
      union all
      select created_at, p1 as opp, game.desync_game(report1, report2, status) as ds from game.matches
       where p2 = p and mode = 'ranked' and created_at > now() - interval '24 hours' and p2_started_at is not null) x;
    if desyncs >= 3 and desync_games >= 5
       and last_desync > now() - make_interval(hours => game.cfg_int('dispute_cooldown_hours')) then
      perform game.fail('cooldown');
    end if;
  elsif lvl < game.cfg_int('casual_min_level') then perform game.fail('level_required', game.cfg_int('casual_min_level')::text);
  end if;
  if not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  insert into game.match_queue as q (player_id, mode, mmr, head_id, cos, ver)
  values (p, queue_mode, case when queue_mode = 'ranked' then game.rating_of(p, s) else 0 end, head, game.clean_cos(p, coalesce(cos, '{}')), coalesce(client_version, 0))
  on conflict (player_id) do update set mode = excluded.mode, mmr = excluded.mmr, head_id = excluded.head_id, cos = excluded.cos, ver = excluded.ver,
    enqueued_at = now(), seen_at = now(), match_id = null;
  return jsonb_build_object('queued', true);
end $$;
