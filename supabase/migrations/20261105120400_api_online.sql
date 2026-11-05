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
create or replace function api.queue_join(queue_mode text, head text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); lvl integer; anon boolean; s integer := game.current_season();
begin
  perform game.limit_rate(p, 'queue_join', 20, interval '1 minute');
  if queue_mode not in ('ranked', 'casual') then perform game.fail('bad_mode'); end if;
  select level into lvl from game.players where id = p;
  select is_anonymous into anon from auth.users where id = p;
  if queue_mode = 'ranked' then
    if coalesce(anon, true) then perform game.fail('account_required'); end if;
    if lvl < game.cfg_int('ranked_min_level') then perform game.fail('level_required', game.cfg_int('ranked_min_level')::text); end if;
    if s is null then perform game.fail('no_season'); end if;
  elsif lvl < game.cfg_int('casual_min_level') then perform game.fail('level_required', game.cfg_int('casual_min_level')::text);
  end if;
  if not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  insert into game.match_queue as q (player_id, mode, mmr, head_id)
  values (p, queue_mode, case when queue_mode = 'ranked' then game.rating_of(p, s) else 0 end, head)
  on conflict (player_id) do update set mode = excluded.mode, mmr = excluded.mmr, head_id = excluded.head_id,
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
          jsonb_build_object('p1', jsonb_build_object('head', h1.head_id, 'level', h1.level),
                             'p2', jsonb_build_object('head', h2.head_id, 'level', h2.level)))
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
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches; mine jsonb; theirs jsonb; side integer;
begin
  perform game.limit_rate(p, 'report_match', 10, interval '1 minute');
  if jsonb_typeof(r->'score') <> 'array' or jsonb_array_length(r->'score') <> 2 then perform game.fail('bad_report'); end if;
  if (r->'score'->>0)::integer not between 0 and 50 or (r->'score'->>1)::integer not between 0 and 50 then perform game.fail('bad_report'); end if;
  if coalesce((r->>'duration')::integer, 0) not between 10 and 900 then perform game.fail('bad_report', 'duration'); end if;
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status <> 'open' then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  side := case when mt.p1 = p then 1 else 2 end;
  mine := jsonb_build_object('score', r->'score', 'duration', (r->>'duration')::integer, 'inputs', left(r->>'inputs', 128), 'at', now());
  if side = 1 then
    if mt.report1 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report1 = mine where id = match; theirs := mt.report2;
  else
    if mt.report2 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report2 = mine where id = match; theirs := mt.report1;
  end if;
  delete from game.match_queue where player_id = p and match_id = match;
  if theirs is null then return jsonb_build_object('status', 'waiting'); end if;
  if theirs->'score' = mine->'score' and theirs->>'inputs' is not distinct from mine->>'inputs' then
    return game.settle(match, mine->'score');
  end if;
  update game.matches set status = 'disputed' where id = match;
  return jsonb_build_object('status', 'disputed');
end $$;

-- ---------- Abrechnen: Wertung (Elo), Münzen, XP, Pass-Punkte ----------
create or replace function game.settle(match uuid, score jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mt game.matches; a integer := (score->>0)::integer; b integer := (score->>1)::integer;
  r1 integer; r2 integer; e1 numeric; k integer := game.cfg_int('elo_k'); s1 numeric; d1 integer; oc jsonb := game.cfg('online_coins');
  res jsonb; w integer;
begin
  select * into mt from game.matches where id = match for update;
  if mt.status not in ('open', 'disputed', 'review') then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  w := case when a > b then 1 when b > a then 2 else 0 end;
  if mt.mode = 'ranked' then
    r1 := game.rating_of(mt.p1, mt.season_id); r2 := game.rating_of(mt.p2, mt.season_id);
    e1 := 1 / (1 + power(10, (r2 - r1) / 400.0));
    s1 := case w when 1 then 1 when 2 then 0 else 0.5 end;
    d1 := round(k * (s1 - e1));
    -- Absprachen erschweren: dasselbe Paar zu oft hintereinander zählt nicht für die Wertung
    if (select count(*) from game.matches x where x.mode = 'ranked' and x.created_at > now() - interval '24 hours'
          and ((x.p1 = mt.p1 and x.p2 = mt.p2) or (x.p1 = mt.p2 and x.p2 = mt.p1))) > game.cfg_int('ranked_pair_limit') then
      d1 := 0;
    end if;
    insert into game.ratings as rt (player_id, season_id, mmr, games, wins) values (mt.p1, mt.season_id, r1 + d1, 1, (w = 1)::integer)
      on conflict (player_id, season_id) do update set mmr = rt.mmr + d1, games = rt.games + 1, wins = rt.wins + (w = 1)::integer, updated_at = now();
    insert into game.ratings as rt (player_id, season_id, mmr, games, wins) values (mt.p2, mt.season_id, r2 - d1, 1, (w = 2)::integer)
      on conflict (player_id, season_id) do update set mmr = rt.mmr - d1, games = rt.games + 1, wins = rt.wins + (w = 2)::integer, updated_at = now();
  end if;
  perform game.book(mt.p1, 'coins', case when w = 1 then (oc->>'win')::integer else (oc->>'loss')::integer end, 'match_' || mt.mode, match::text);
  perform game.book(mt.p2, 'coins', case when w = 2 then (oc->>'win')::integer else (oc->>'loss')::integer end, 'match_' || mt.mode, match::text);
  perform game.add_xp(mt.p1, 40); perform game.add_xp(mt.p2, 40);
  perform game.add_pass_points(mt.p1, case when w = 1 then 15 else 8 end);
  perform game.add_pass_points(mt.p2, case when w = 2 then 15 else 8 end);
  update game.heads set xp = xp + case when w = 1 then 40 else 20 end, games = games + 1 where player_id = mt.p1 and head_id = mt.heads->'p1'->>'head';
  update game.heads set xp = xp + case when w = 2 then 40 else 20 end, games = games + 1 where player_id = mt.p2 and head_id = mt.heads->'p2'->>'head';
  perform game.progress_tasks(mt.p1, jsonb_build_object('online', 1, 'wins', (w = 1)::integer, 'goals', a));
  perform game.progress_tasks(mt.p2, jsonb_build_object('online', 1, 'wins', (w = 2)::integer, 'goals', b));
  if w = 1 then perform game.grant_achievements(mt.p1, '{online,firstwin}'); end if;
  if w = 2 then perform game.grant_achievements(mt.p2, '{online,firstwin}'); end if;
  res := jsonb_build_object('score', score, 'winner', w, 'mmrDelta', d1);
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
  return game.settle(match, score);
end $$;

-- ---------- Bestenlisten ----------
-- Endlos: Siege am Stück (höchstens so viele, wie der Server Computer-Spiele gesehen hat). Tages-Challenge: Punkte.
create or replace function api.submit_score(board text, score integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); games integer; per text; old integer;
begin
  perform game.limit_rate(p, 'score', 10, interval '1 minute');
  if board not in ('endless', 'daily') or score < 0 or score > 100000 then perform game.fail('bad_score'); end if;
  if board = 'endless' then
    -- höchstens so viele Siege am Stück, wie der Server Endlos-Siege gesehen hat
    select coalesce((stats->>'endlessWins')::integer, 0) into games from game.progress where player_id = p;
    if score > games then perform game.fail('implausible', 'score'); end if;
  end if;
  foreach per in array array['all', current_date::text] loop
    select sc.score into old from game.scores sc where sc.board = submit_score.board and sc.period = per and sc.player_id = p for update;
    if old is not null and old >= submit_score.score then continue; end if;
    insert into game.scores as sc (board, period, player_id, score) values (submit_score.board, per, p, submit_score.score)
    on conflict on constraint scores_pkey do update set score = excluded.score, updated_at = now();
    if old is not null then
      update game.score_counts c set n = c.n - 1 where c.board = submit_score.board and c.period = per and c.score = old;
    end if;
    insert into game.score_counts as c (board, period, score, n) values (submit_score.board, per, submit_score.score, 1)
    on conflict on constraint score_counts_pkey do update set n = c.n + 1;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function api.leaderboard(board text, period text default 'all', lim integer default 50, offs integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', offs + rn, 'name', coalesce(name, 'Spieler'), 'title', title, 'frame', frame, 'score', score) order by rn), '[]')
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
declare p uuid := game.me(); me game.scores; k integer := least(greatest(n, 1), 25); above jsonb; below jsonb;
begin
  select * into me from game.scores sc where sc.board = leaderboard_around.board and sc.period = leaderboard_around.period and sc.player_id = p;
  if me.player_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x->>'score' desc), '[]') into above from (
    select jsonb_build_object('name', pl.name, 'score', sc.score) x from game.scores sc join game.players pl on pl.id = sc.player_id
    where sc.board = me.board and sc.period = me.period and (sc.score, sc.updated_at) > (me.score, me.updated_at) and sc.player_id <> p
    order by sc.score, sc.updated_at limit k) t;
  select coalesce(jsonb_agg(x), '[]') into below from (
    select jsonb_build_object('name', pl.name, 'score', sc.score) x from game.scores sc join game.players pl on pl.id = sc.player_id
    where sc.board = me.board and sc.period = me.period and (sc.score, sc.updated_at) < (me.score, me.updated_at) and sc.player_id <> p
    order by sc.score desc, sc.updated_at desc limit k) t;
  return above || jsonb_build_array(jsonb_build_object('name', (select name from game.players where id = p), 'score', me.score, 'me', true)) || below;
end $$;

-- Ranked-Rangliste der laufenden Saison
create or replace function api.ranked_board(lim integer default 50, offs integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', offs + rn, 'name', coalesce(name, 'Spieler'), 'title', title, 'mmr', mmr, 'league', game.league(mmr)) order by rn), '[]')
  from (
    select row_number() over (order by r.mmr desc, r.player_id) as rn, pl.name, pl.title, r.mmr
    from game.ratings r join game.players pl on pl.id = r.player_id
    where r.season_id = game.current_season()
    order by r.mmr desc, r.player_id
    limit least(greatest(lim, 1), 100) offset greatest(offs, 0)
  ) t
$$;

-- ---------- Freunde ----------
create or replace function api.friend_request(friend_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); f uuid;
begin
  perform game.limit_rate(p, 'friend_request', 20, interval '1 hour');
  select id into f from game.players where lower(name) = lower(btrim(friend_name));
  if f is null or f = p then perform game.fail('unknown_player'); end if;
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
  select id into f from game.players where lower(name) = lower(btrim(friend_name));
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

grant execute on function api.queue_join(text, text), api.queue_poll(), api.queue_leave(), api.report_match(uuid, jsonb),
  api.submit_score(text, integer), api.my_rank(text, text), api.leaderboard_around(text, text, integer), api.friend_request(text), api.friend_remove(text), api.friends() to authenticated;
-- Bestenlisten darf jeder lesen, auch ohne Anmeldung (für die Website)
grant execute on function api.leaderboard(text, text, integer, integer), api.ranked_board(integer, integer) to anon, authenticated;
-- Nur der Prüfdienst
grant execute on function api.settle_match(uuid, jsonb) to service_role;
