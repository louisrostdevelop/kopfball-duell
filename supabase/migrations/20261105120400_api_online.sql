-- =====================================================================================
-- Online: Matchmaking (Ranked und Casual), Spielergebnisse, Wertung, Bestenlisten, Freunde.
-- Das Spiel selbst läuft direkt zwischen den Spielern (WebRTC). Der Server bringt sie zusammen,
-- legt die Kopfwerte fest und nimmt die Ergebnisse beider Seiten an.
-- =====================================================================================

create or replace function game.league(mmr integer) returns text
language sql immutable set search_path = '' as $$
  select case when mmr >= 2000 then 'legende' when mmr >= 1700 then 'diamant' when mmr >= 1450 then 'platin'
              when mmr >= 1250 then 'gold' when mmr >= 1100 then 'silber' else 'bronze' end
$$;

create or replace function game.rating_of(p uuid, s integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select mmr from game.ratings where player_id = p and season_id = s), game.cfg_int('elo_start'))
$$;

-- ---------- In die Warteschlange ----------
-- Kosmetik prüfen: nur Besessenes der passenden Art; Emotes: besessene oder kurze Standard-Emotes
create or replace function game.clean_cos(p uuid, c jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'shoes', (select i.item_id from game.inventory i join game.items x on x.id = i.item_id where i.player_id = p and i.item_id = c->>'shoes' and x.kind = 'shoes'),
    'goalfx', (select i.item_id from game.inventory i join game.items x on x.id = i.item_id where i.player_id = p and i.item_id = c->>'goalfx' and x.kind = 'goalfx'),
    'title', (select i.item_id from game.inventory i join game.items x on x.id = i.item_id where i.player_id = p and i.item_id = c->>'title' and x.kind = 'title'),
    'frame', (select i.item_id from game.inventory i join game.items x on x.id = i.item_id where i.player_id = p and i.item_id = c->>'frame' and x.kind = 'frame'),
    'emotes', (select coalesce(jsonb_agg(e), '[]') from (select e from jsonb_array_elements_text(case when jsonb_typeof(c->'emotes') = 'array' then c->'emotes' else '[]' end) e
                where (e not like '%:%' and char_length(e) <= 4)
                   or exists (select 1 from game.inventory i join game.items x on x.id = i.item_id where i.player_id = p and i.item_id = e and x.kind in ('emote', 'emoji'))
                limit 4) q)))
$$;

drop function if exists api.queue_join(text, text);
create or replace function api.queue_join(queue_mode text, head text, cos jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); lvl integer; anon boolean; s integer := game.current_season(); disputes integer; last_dispute timestamptz;
begin
  perform game.limit_rate(p, 'queue_join', 20, interval '1 minute');
  if queue_mode not in ('ranked', 'casual') then perform game.fail('bad_mode'); end if;
  select level into lvl from game.players where id = p;
  select is_anonymous into anon from auth.users where id = p;
  if queue_mode = 'ranked' then
    if coalesce(anon, true) then perform game.fail('account_required'); end if;
    if lvl < game.cfg_int('ranked_min_level') then perform game.fail('level_required', game.cfg_int('ranked_min_level')::text); end if;
    if s is null then perform game.fail('no_season'); end if;
    -- Viele strittige Spiele (beide haben gemeldet, Ergebnisse passen nicht zusammen): Ranked-Pause
    select count(*), max(created_at) into disputes, last_dispute from (
      select created_at, status, report1, report2 from game.matches where p1 = p and created_at > now() - interval '24 hours'
      union all
      select created_at, status, report1, report2 from game.matches where p2 = p and created_at > now() - interval '24 hours') x
     where status = 'disputed' or (status = 'void' and report1 is not null and report2 is not null);
    if disputes >= game.cfg_int('dispute_limit') and last_dispute > now() - make_interval(hours => game.cfg_int('dispute_cooldown_hours')) then
      perform game.fail('cooldown');
    end if;
  elsif lvl < game.cfg_int('casual_min_level') then perform game.fail('level_required', game.cfg_int('casual_min_level')::text);
  end if;
  if not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  insert into game.match_queue as q (player_id, mode, mmr, head_id, cos)
  values (p, queue_mode, case when queue_mode = 'ranked' then game.rating_of(p, s) else 0 end, head, game.clean_cos(p, coalesce(cos, '{}')))
  on conflict (player_id) do update set mode = excluded.mode, mmr = excluded.mmr, head_id = excluded.head_id, cos = excluded.cos,
    enqueued_at = now(), seen_at = now(), match_id = null;
  return jsonb_build_object('queued', true);
end $$;

-- ---------- Abfragen (alle ~2 s): schon gepaart? sonst passenden Gegner suchen ----------
-- Paaren mit FOR UPDATE SKIP LOCKED: viele gleichzeitige Abfragen blockieren sich nicht gegenseitig.
create or replace function api.queue_poll() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); me game.match_queue; other game.match_queue; up game.match_queue; down game.match_queue; waited numeric; win integer; m uuid; s integer;
  h1 game.heads; h2 game.heads;
begin
  select * into me from game.match_queue where player_id = p for update;
  if me.player_id is null then perform game.fail('not_queued'); end if;
  if me.match_id is not null then return game.match_info(me.match_id, p); end if;
  -- Bremse ohne eigene Schreibzugriffe: höchstens alle 0,5 s suchen (seen_at wird ohnehin aktualisiert)
  if me.seen_at > now() - interval '500 milliseconds' and me.seen_at > me.enqueued_at then
    return jsonb_build_object('matched', false, 'waited', round(extract(epoch from now() - me.enqueued_at)));
  end if;
  update game.match_queue set seen_at = now() where player_id = p;
  waited := extract(epoch from now() - me.enqueued_at);
  win := case when me.mode = 'ranked' then least(600, 100 + (waited * 25)::integer) else 1000000 end;
  if me.mode = 'casual' then
    -- Casual: wer am längsten wartet (Index auf Wartezeit)
    select * into other from game.match_queue
     where mode = 'casual' and match_id is null and player_id <> p and seen_at > now() - interval '10 seconds'
     order by enqueued_at limit 1 for update skip locked;
  else
    -- Ranked: nächster Gegner darüber und darunter über den Wertungs-Index, der nähere gewinnt
    select * into up from game.match_queue
     where mode = 'ranked' and match_id is null and player_id <> p and mmr >= me.mmr and mmr <= me.mmr + win
       and seen_at > now() - interval '10 seconds'
     order by mmr limit 1 for update skip locked;
    select * into down from game.match_queue
     where mode = 'ranked' and match_id is null and player_id <> p and mmr < me.mmr and mmr >= me.mmr - win
       and seen_at > now() - interval '10 seconds'
     order by mmr desc limit 1 for update skip locked;
    other := case when up.player_id is null then down when down.player_id is null then up
                  when up.mmr - me.mmr <= me.mmr - down.mmr then up else down end;
  end if;
  if other.player_id is null then return jsonb_build_object('matched', false, 'waited', round(waited)); end if;
  s := case when me.mode = 'ranked' then game.current_season() end;
  select * into h1 from game.heads where player_id = other.player_id and head_id = other.head_id;
  select * into h2 from game.heads where player_id = p and head_id = me.head_id;
  -- Wer länger wartet, hostet (hat meist die stabilere Verbindung schon offen)
  insert into game.matches (mode, season_id, p1, p2, heads)
  values (me.mode, s, other.player_id, p,
          jsonb_build_object('p1', jsonb_build_object('head', h1.head_id, 'level', h1.level, 'cos', other.cos),
                             'p2', jsonb_build_object('head', h2.head_id, 'level', h2.level, 'cos', me.cos)))
  returning id into m;
  update game.match_queue set match_id = m where player_id in (p, other.player_id);
  -- Der Wartende erfährt es sofort über seinen Kanal (sonst bei seiner nächsten Abfrage)
  perform game.notify('user:' || other.player_id, 'matched', jsonb_build_object('match', m));
  return game.match_info(m, p);
end $$;

create or replace function api.queue_leave() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  delete from game.match_queue where player_id = p and match_id is null;
  return jsonb_build_object('left', true);
end $$;

-- Infos zu einem Spiel für einen der beiden Spieler
create or replace function game.match_info(m uuid, p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('matched', true, 'match', mt.id, 'mode', mt.mode,
    'role', case when mt.p1 = p then 'host' else 'guest' end,
    'opponent', jsonb_build_object('name', coalesce(op.name, 'Gast'), 'level', op.level,
                                   'mmr', case when mt.mode = 'ranked' then game.rating_of(op.id, mt.season_id) end),
    'heads', mt.heads, 'channel', 'match:' || mt.id)
  from game.matches mt
  join game.players op on op.id = case when mt.p1 = p then mt.p2 else mt.p1 end
  where mt.id = m and p in (mt.p1, mt.p2)
$$;

-- ---------- Ergebnis melden ----------
-- r: {"score":[a,b],"duration":s,"inputs":"<hash des Eingabe-Protokolls>"}. Stimmen beide Meldungen
-- überein, wird abgerechnet. Sonst: strittig, ein Prüfdienst spielt das Spiel nach (api.settle_match).
create or replace function api.report_match(match uuid, r jsonb) returns jsonb
-- r: { score: [host, gast], duration: s, forfeit?: true (Gegner ist mitten im Spiel weg) }
-- Gewertet wird, wenn beide dasselbe melden; meldet nur einer, gilt seine Meldung nach forfeit_after_secs (Wartung).
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches; mine jsonb; theirs jsonb; side integer; dur integer := coalesce((r->>'duration')::integer, 0);
begin
  perform game.limit_rate(p, 'report_match', 10, interval '1 minute');
  if jsonb_typeof(r->'score') <> 'array' or jsonb_array_length(r->'score') <> 2 then perform game.fail('bad_report'); end if;
  if (r->'score'->>0)::integer not between 0 and 50 or (r->'score'->>1)::integer not between 0 and 50 then perform game.fail('bad_report'); end if;
  if dur not between 10 and 900 then perform game.fail('bad_report', 'duration'); end if;
  -- Tore passen zur Dauer (wie bei Computer-Spielen): 50:0 in 30 Sekunden ist eine Absprache, kein Spiel
  if (r->'score'->>0)::integer + (r->'score'->>1)::integer > dur / 3 + 2 then perform game.fail('implausible', 'goal_rate'); end if;
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status <> 'open' then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  -- Ein Spiel kann nicht schneller vorbei sein, als es gedauert hat (Schutz vor Absprachen im Sekundentakt)
  if now() - mt.created_at < make_interval(secs => greatest(game.cfg_int('online_min_secs'), dur * 0.8)) and not coalesce((r->>'forfeit')::boolean, false) then
    perform game.fail('implausible', 'too_early');
  end if;
  side := case when mt.p1 = p then 1 else 2 end;
  mine := jsonb_build_object('score', r->'score', 'duration', dur, 'forfeit', coalesce((r->>'forfeit')::boolean, false), 'at', now());
  if side = 1 then
    if mt.report1 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report1 = mine where id = match; theirs := mt.report2;
  else
    if mt.report2 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report2 = mine where id = match; theirs := mt.report1;
  end if;
  delete from game.match_queue where player_id = p and match_id = match;
  if theirs is null then return jsonb_build_object('status', 'waiting'); end if;
  if theirs->'score' = mine->'score' and (theirs->>'forfeit')::boolean is not distinct from (mine->>'forfeit')::boolean then
    return game.settle(match, mine->'score', null);
  end if;
  update game.matches set status = 'disputed' where id = match;
  return jsonb_build_object('status', 'disputed');
end $$;

-- Stand eines Online-Spiels für den, der zuerst gemeldet hat (wartet auf die andere Seite)
create or replace function api.match_status(match uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', mt.status, 'result', mt.result)
  from game.matches mt where mt.id = match and game.me() in (mt.p1, mt.p2)
$$;

-- Wertung und Belohnung. forced_winner (1/2): Aufgabe des anderen (er ist mitten im Spiel weg).
-- Ohne Belohnung (Elo zählt trotzdem): mehr als ranked_pair_limit Spiele desselben Paars in 24 h, oder heute schon
-- online_daily_rewarded belohnte Online-Spiele. So bringt Spielen gegen das eigene Zweitkonto nichts.
drop function if exists game.settle(uuid, jsonb);   -- alte Fassung ohne forced_winner
create or replace function game.settle(match uuid, score jsonb, forced_winner integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mt game.matches; a integer := (score->>0)::integer; b integer := (score->>1)::integer;
  r1 integer; r2 integer; e1 numeric; k integer := game.cfg_int('elo_k'); s1 numeric; d1 integer; oc jsonb := game.cfg('online_coins');
  g1 integer; g2 integer; prov integer := game.cfg_int('ranked_provisional'); up1 integer; up2 integer;
  res jsonb; w integer; pair integer; pl uuid; idx integer; won boolean; ok boolean; today date := game.today(); reward jsonb := '{}';
begin
  select * into mt from game.matches where id = match for update;
  if mt.status not in ('open', 'disputed', 'review') then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  w := coalesce(forced_winner, case when a > b then 1 when b > a then 2 else 0 end);
  select count(*) into pair from game.matches x where x.created_at > now() - interval '24 hours' and x.status = 'settled'
     and ((x.p1 = mt.p1 and x.p2 = mt.p2) or (x.p1 = mt.p2 and x.p2 = mt.p1));
  d1 := 0;
  if mt.mode = 'ranked' then
    r1 := game.rating_of(mt.p1, mt.season_id); r2 := game.rating_of(mt.p2, mt.season_id);
    e1 := 1 / (1 + power(10, (r2 - r1) / 400.0));
    s1 := case w when 1 then 1 when 2 then 0 else 0.5 end;
    d1 := round(k * (s1 - e1));
    if pair >= game.cfg_int('ranked_pair_limit') then d1 := 0; end if;
    -- Zweitkonten: wer gegen ein neues Konto gewinnt, bekommt nur anteilig Punkte (der Verlierer verliert voll)
    select coalesce((select games from game.ratings where player_id = mt.p1 and season_id = mt.season_id), 0),
           coalesce((select games from game.ratings where player_id = mt.p2 and season_id = mt.season_id), 0) into g1, g2;
    up1 := case when d1 > 0 then round(d1 * least(1, g2::numeric / prov)) else d1 end;    -- Änderung für p1
    up2 := case when d1 < 0 then round(-d1 * least(1, g1::numeric / prov)) else -d1 end;  -- Änderung für p2
    insert into game.ratings as rt (player_id, season_id, mmr, games, wins) values (mt.p1, mt.season_id, r1 + up1, 1, (w = 1)::integer)
      on conflict (player_id, season_id) do update set mmr = rt.mmr + up1, games = rt.games + 1, wins = rt.wins + (w = 1)::integer, updated_at = now();
    insert into game.ratings as rt (player_id, season_id, mmr, games, wins) values (mt.p2, mt.season_id, r2 + up2, 1, (w = 2)::integer)
      on conflict (player_id, season_id) do update set mmr = rt.mmr + up2, games = rt.games + 1, wins = rt.wins + (w = 2)::integer, updated_at = now();
  end if;
  foreach pl in array array[mt.p1, mt.p2] loop
    idx := case when pl = mt.p1 then 1 else 2 end; won := w = idx;
    -- Tageszähler belohnter Online-Spiele (ein Schreibvorgang, mit Sperre)
    update game.progress set online_rewarded = case when online_day = today then online_rewarded + 1 else 1 end, online_day = today
     where player_id = pl returning online_rewarded <= game.cfg_int('online_daily_rewarded') into ok;
    ok := coalesce(ok, false) and pair < game.cfg_int('ranked_pair_limit');
    reward := reward || jsonb_build_object('p' || idx, ok);
    continue when not ok;
    perform game.book(pl, 'coins', case when won then (oc->>'win')::integer else (oc->>'loss')::integer end, 'match_' || mt.mode, match::text);
    perform game.add_xp(pl, 40);
    perform game.add_pass_points(pl, case when won then 15 else 8 end);
    update game.heads set xp = xp + case when won then 80 else 40 end, games = games + 1 where player_id = pl and head_id = mt.heads->('p' || idx)->>'head';
    -- Tore für Meisterschaft und Aufgaben höchstens 10 pro Spiel (abgesprochene Kantersiege bringen nichts extra)
    perform game.progress_mastery(pl, mt.heads->('p' || idx)->>'head', won, least(10, case when idx = 1 then a else b end), 0);
    perform game.progress_tasks(pl, jsonb_build_object('online', 1, 'wins', won::integer, 'goals', least(10, case when idx = 1 then a else b end)));
    perform game.progress_weekly(pl, jsonb_build_object('online', 1, 'wins', won::integer, 'goals', least(10, case when idx = 1 then a else b end),
                   'clean', case when won and (case when idx = 1 then b else a end) = 0 then 1 else 0 end), mt.heads->('p' || idx)->>'head');
    if won then perform game.grant_achievements(pl, '{online,firstwin}'); end if;
  end loop;
  res := jsonb_build_object('score', score, 'winner', w, 'mmrDelta', d1, 'mmr', jsonb_build_object('p1', coalesce(up1, 0), 'p2', coalesce(up2, 0)),
    'rewarded', reward, 'forfeit', forced_winner is not null);
  update game.matches set status = 'settled', result = res, settled_at = now() where id = match;
  return jsonb_build_object('status', 'settled', 'result', res);
end $$;

-- Prüfdienst (Edge Function mit Service-Schlüssel) entscheidet strittige Spiele
create or replace function api.settle_match(match uuid, score jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if score is null then
    update game.matches set status = 'void', settled_at = now() where id = match and status in ('open', 'disputed', 'review');
    return jsonb_build_object('status', 'void');
  end if;
  return game.settle(match, score, null);
end $$;

-- ---------- Bestenlisten ----------
-- Endlos: Siege am Stück (höchstens so viele, wie der Server Computer-Spiele gesehen hat). Tages-Challenge: Punkte.
-- Bestwert eintragen (nur Server-intern: Endlos-Serien schreibt report_cpu_match selbst). Pflegt score_counts mit.
create or replace function game.put_score(p uuid, board text, score integer) returns void
language plpgsql security definer set search_path = '' as $$
declare per text; old integer;
begin
  foreach per in array array['all', game.today()::text] loop
    select sc.score into old from game.scores sc where sc.board = put_score.board and sc.period = per and sc.player_id = p for update;
    if old is not null and old >= put_score.score then continue; end if;
    insert into game.scores as sc (board, period, player_id, score) values (put_score.board, per, p, put_score.score)
    on conflict on constraint scores_pkey do update set score = excluded.score, updated_at = now();
    if old is not null then
      update game.score_counts c set n = c.n - 1 where c.board = put_score.board and c.period = per and c.score = old;
    end if;
    insert into game.score_counts as c (board, period, score, n) values (put_score.board, per, put_score.score, 1)
    on conflict on constraint score_counts_pkey do update set n = c.n + 1;
  end loop;
end $$;

-- Vom Client: nur Endlos, und höchstens die Serie, die der Server selbst gezählt hat (endless_best)
create or replace function api.submit_score(board text, score integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); best integer;
begin
  perform game.limit_rate(p, 'score', 10, interval '1 minute');
  if board <> 'endless' or score < 0 then perform game.fail('bad_score'); end if;
  select endless_best into best from game.progress where player_id = p;
  if score > coalesce(best, 0) then perform game.fail('implausible', 'score'); end if;
  perform game.put_score(p, board, score);
  return jsonb_build_object('ok', true);
end $$;

-- Gelöschte Einträge (auch über gelöschte Spieler) aus den Rang-Zählern nehmen
create or replace function game.scores_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update game.score_counts c set n = c.n - g.cnt
    from (select board, period, score, count(*)::integer cnt from gone group by 1, 2, 3) g
   where c.board = g.board and c.period = g.period and c.score = g.score;
  return null;
end $$;
drop trigger if exists scores_deleted on game.scores;
create trigger scores_deleted after delete on game.scores referencing old table as gone for each statement execute function game.scores_deleted();

create or replace function api.leaderboard(board text, period text default 'all', lim integer default 50, offs integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  -- row_number() läuft vor LIMIT/OFFSET: rn ist schon der echte Platz
  select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'name', coalesce(name, 'Spieler'), 'title', title, 'frame', frame, 'score', score) order by rn), '[]')
  from (
    select row_number() over (order by sc.score desc, sc.updated_at) as rn, pl.name, pl.title, pl.frame, sc.score
    from game.scores sc join game.players pl on pl.id = sc.player_id
    where sc.board = leaderboard.board and sc.period = leaderboard.period
    order by sc.score desc, sc.updated_at
    limit least(greatest(lim, 1), 100) offset least(greatest(offs, 0), 10000)
  ) t
$$;

create or replace function api.my_rank(board text, period text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p uuid := game.me(); mine integer; better bigint;
begin
  select sc.score into mine from game.scores sc where sc.board = my_rank.board and sc.period = my_rank.period and sc.player_id = p;
  if mine is null then return jsonb_build_object('rank', null); end if;
  -- Gleiche Punktzahl = gleicher Rang
  select coalesce(sum(c.n), 0) into better from game.score_counts c
   where c.board = my_rank.board and c.period = my_rank.period and c.score > mine;
  return jsonb_build_object('rank', better + 1, 'score', mine);
end $$;

-- Die Spieler direkt über und unter mir (Blättern über den Index statt OFFSET)
create or replace function api.leaderboard_around(board text, period text default 'all', n integer default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
-- Reihenfolge wie die Bestenliste: mehr Punkte zuerst, bei Gleichstand wer früher dort war.
-- Je zwei Abfragen (Gleichstand / echt besser bzw. schlechter), damit beide direkt über den Index scores_board laufen.
declare p uuid := game.me(); me game.scores; k integer := least(greatest(n, 1), 25); above jsonb; below jsonb;
begin
  select * into me from game.scores sc where sc.board = leaderboard_around.board and sc.period = leaderboard_around.period and sc.player_id = p;
  if me.player_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) order by x.score desc, x.updated_at), '[]') into above from (
    select * from (
      (select pl.name, sc.score, sc.updated_at from game.scores sc join game.players pl on pl.id = sc.player_id
        where sc.board = me.board and sc.period = me.period and sc.score = me.score and sc.updated_at < me.updated_at
        order by sc.score desc, sc.updated_at desc limit k)
      union all
      (select pl.name, sc.score, sc.updated_at from game.scores sc join game.players pl on pl.id = sc.player_id
        where sc.board = me.board and sc.period = me.period and sc.score > me.score
        order by sc.score, sc.updated_at desc limit k)
    ) u order by u.score, u.updated_at desc limit k) x;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) order by x.score desc, x.updated_at), '[]') into below from (
    select * from (
      (select pl.name, sc.score, sc.updated_at from game.scores sc join game.players pl on pl.id = sc.player_id
        where sc.board = me.board and sc.period = me.period and sc.score = me.score and sc.updated_at > me.updated_at and sc.player_id <> p
        order by sc.score desc, sc.updated_at limit k)
      union all
      (select pl.name, sc.score, sc.updated_at from game.scores sc join game.players pl on pl.id = sc.player_id
        where sc.board = me.board and sc.period = me.period and sc.score < me.score
        order by sc.score desc, sc.updated_at limit k)
    ) u order by u.score desc, u.updated_at limit k) x;
  return above || jsonb_build_array(jsonb_build_object('name', (select name from game.players where id = p), 'score', me.score, 'me', true)) || below;
end $$;

-- Ranked-Rangliste der laufenden Saison
create or replace function api.ranked_board(lim integer default 50, offs integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'name', coalesce(name, 'Spieler'), 'title', title, 'mmr', mmr, 'league', game.league(mmr)) order by rn), '[]')
  from (
    select row_number() over (order by r.mmr desc, r.player_id) as rn, pl.name, pl.title, r.mmr
    from game.ratings r join game.players pl on pl.id = r.player_id
    where r.season_id = game.current_season()
    order by r.mmr desc, r.player_id
    limit least(greatest(lim, 1), 100) offset least(greatest(offs, 0), 1000)
  ) t
$$;

-- Mein Platz in Ranked: über den Index gezählt, nach oben gedeckelt (ab 10 000 heißt es "10000+")
create or replace function api.my_ranked_rank() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p uuid := game.me(); s integer := game.current_season(); mine game.ratings; better integer;
begin
  select * into mine from game.ratings where player_id = p and season_id = s;
  if mine.player_id is null then return jsonb_build_object('rank', null); end if;
  select count(*) into better from (select 1 from game.ratings r where r.season_id = s and r.mmr > mine.mmr limit 10000) x;
  return jsonb_build_object('rank', better + 1, 'capped', better >= 10000, 'mmr', mine.mmr, 'league', game.league(mine.mmr), 'games', mine.games, 'wins', mine.wins);
end $$;

-- ---------- Freunde ----------
create or replace function api.friend_request(friend_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); f uuid;
begin
  perform game.limit_rate(p, 'friend_request', 20, interval '1 hour');
  select id into f from game.players where name is not null and lower(name) = lower(btrim(friend_name));   -- passt zum Teilindex players_name_key
  if f is null or f = p then perform game.fail('unknown_player'); end if;
  -- Obergrenze, damit Listen klein bleiben
  if (select count(*) from game.friends where player_id = p) >= 200 then perform game.fail('too_many_friends'); end if;
  -- Hat der andere schon angefragt? Dann direkt Freunde.
  if exists (select 1 from game.friends where player_id = f and friend_id = p and status = 'pending') then
    update game.friends set status = 'accepted' where player_id = f and friend_id = p;
    insert into game.friends (player_id, friend_id, status) values (p, f, 'accepted') on conflict (player_id, friend_id) do update set status = 'accepted';
    return jsonb_build_object('status', 'accepted');
  end if;
  insert into game.friends (player_id, friend_id, status) values (p, f, 'pending') on conflict do nothing;
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function api.friend_remove(friend_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); f uuid;
begin
  select id into f from game.players where name is not null and lower(name) = lower(btrim(friend_name));   -- passt zum Teilindex players_name_key
  delete from game.friends where (player_id = p and friend_id = f) or (player_id = f and friend_id = p);
  return jsonb_build_object('ok', true);
end $$;

create or replace function api.friends() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('name', pl.name, 'level', pl.level, 'title', pl.title, 'frame', pl.frame, 'lastSeen', pl.last_seen_at) order by pl.name)
                 from game.friends f join game.players pl on pl.id = f.friend_id where f.player_id = auth.uid() and f.status = 'accepted'), '[]'),
    'incoming', coalesce((select jsonb_agg(pl.name order by f.created_at) from game.friends f join game.players pl on pl.id = f.player_id
                 where f.friend_id = auth.uid() and f.status = 'pending'), '[]'))
$$;

-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;

grant execute on function api.queue_join(text, text, jsonb), api.queue_poll(), api.queue_leave(), api.report_match(uuid, jsonb), api.match_status(uuid),
  api.submit_score(text, integer), api.my_rank(text, text), api.leaderboard_around(text, text, integer), api.friend_request(text), api.friend_remove(text), api.friends() to authenticated;
-- Bestenlisten darf jeder lesen, auch ohne Anmeldung (für die Website)
grant execute on function api.leaderboard(text, text, integer, integer), api.ranked_board(integer, integer) to anon, authenticated;
grant execute on function api.my_ranked_rank() to authenticated;
-- Nur der Prüfdienst
grant execute on function api.settle_match(uuid, jsonb) to service_role;
