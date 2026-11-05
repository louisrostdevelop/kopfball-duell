-- =====================================================================================
-- Öffentliche Funktionen für Profil und Wirtschaft (Schema api).
-- Jede Funktion: Aufrufer bestimmen, Eingaben prüfen, begrenzen, atomar ausführen,
-- den neuen Zustand zurückgeben (spart dem Client eine zweite Anfrage).
-- =====================================================================================

-- ---------- Zustand ----------
create or replace function api.me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  -- Fehlt der Spieler (z. B. Auth-Konto vor dieser Migration angelegt), jetzt anlegen
  perform game.setup_player(p);
  update game.players set last_seen_at = now() where id = p and last_seen_at < now() - interval '10 minutes';
  return game.state(p);
end $$;

-- ---------- Name: 3–16 Zeichen, Buchstaben/Ziffern/_/-, eindeutig, Wortfilter ----------
create or replace function api.set_name(new_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); n text := btrim(new_name);
begin
  perform game.limit_rate(p, 'set_name', 5, interval '1 hour');
  if n is null or length(n) < game.cfg_int('name_min') or length(n) > game.cfg_int('name_max') then perform game.fail('name_length'); end if;
  if n !~ '^[A-Za-z0-9ÄÖÜäöüß_\-]+$' then perform game.fail('name_chars'); end if;
  if exists (select 1 from game.banned_words b where position(b.word in lower(n)) > 0) then perform game.fail('name_blocked'); end if;
  begin
    update game.players set name = n where id = p;
  exception when unique_violation then
    perform game.fail('name_taken');
  end;
  return game.state(p);
end $$;

-- ---------- Einstellungen (Ton, Grafik, Presets ...) frei, aber begrenzt ----------
create or replace function api.set_prefs(new_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.limit_rate(p, 'set_prefs', 30, interval '1 minute');
  if jsonb_typeof(new_prefs) <> 'object' then perform game.fail('bad_prefs'); end if;
  if octet_length(new_prefs::text) > 8192 then perform game.fail('prefs_too_large'); end if;
  update game.players set prefs = new_prefs where id = p;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Tagesbonus: einmal am Tag, Serie bis 7 ----------
create or replace function api.claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); pr game.progress; streak integer; amount integer;
begin
  select * into pr from game.progress where player_id = p for update;
  if pr.daily_last = current_date then perform game.fail('already_claimed'); end if;
  streak := case when pr.daily_last = current_date - 1 then least(7, pr.daily_streak + 1) else 1 end;
  amount := 40 + streak * 30;
  update game.progress set daily_last = current_date, daily_streak = streak where player_id = p;
  perform game.book(p, 'coins', amount, 'daily', current_date::text);
  return jsonb_build_object('amount', amount, 'streak', streak, 'state', game.state_brief(p));
end $$;

-- ---------- Tagesaufgaben für heute (für alle gleich, aus dem Datum bestimmt) ----------
create or replace function game.ensure_tasks(p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t jsonb;
begin
  select tasks into t from game.progress where player_id = p and tasks_day = current_date;
  if t is not null then return t; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'n', d.goals[1 + ((hashtext(d.id || current_date::text)::bigint % array_length(d.goals, 1)) + array_length(d.goals, 1)) % array_length(d.goals, 1)],
                                               'prog', 0, 'done', false, 'reward', d.reward) order by md5(current_date::text || d.id)), '[]')
    into t
    from (select * from game.task_defs where active order by md5(current_date::text || id) limit 3) d;
  update game.progress set tasks = t, tasks_day = current_date where player_id = p;
  return t;
end $$;

-- inc: {"wins":1,"goals":3,...} -> erledigte Aufgaben werden ausgezahlt
create or replace function game.progress_tasks(p uuid, inc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t jsonb := game.ensure_tasks(p); out jsonb := '[]'; done jsonb := '[]'; e jsonb; prog integer;
begin
  for e in select * from jsonb_array_elements(t) loop
    if not (e->>'done')::boolean and coalesce((inc->>(e->>'id'))::integer, 0) > 0 then
      prog := least((e->>'n')::integer, (e->>'prog')::integer + (inc->>(e->>'id'))::integer);
      e := jsonb_set(e, '{prog}', to_jsonb(prog));
      if prog >= (e->>'n')::integer then
        e := jsonb_set(e, '{done}', 'true');
        perform game.book(p, 'coins', (e->>'reward')::integer, 'task', e->>'id');
        done := done || e;
      end if;
    end if;
    out := out || e;
  end loop;
  update game.progress set tasks = out where player_id = p;
  return done;
end $$;

-- ---------- Erfolge (einmalig) ----------
create or replace function game.grant_achievements(p uuid, ids text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare got jsonb := '[]'; a game.achievement_defs; ach jsonb; st jsonb; nheads integer;
begin
  select achievements, stats into ach, st from game.progress where player_id = p for update;
  select count(*) into nheads from game.heads where player_id = p;
  if nheads >= 6 then ids := array_append(ids, 'collector'); end if;
  for a in select * from game.achievement_defs where stat is not null loop
    if coalesce((st->>a.stat)::integer, 0) >= a.goal then ids := array_append(ids, a.id); end if;
  end loop;
  for a in select * from game.achievement_defs where id = any(ids) loop
    if not ach ? a.id then
      ach := ach || jsonb_build_object(a.id, now());
      perform game.book(p, 'coins', a.reward, 'achievement', a.id);
      got := got || to_jsonb(a.id);
    end if;
  end loop;
  update game.progress set achievements = ach where player_id = p;
  return got;
end $$;

-- ---------- Spiel gegen den Computer melden ----------
-- r: {"mode":"cpu|career|endless|daily|local|train","won":bool,"goals":n,"conceded":n,"duration":s,"head":"kalle","diff":0-3,
--     "stats":{"headGoals":n,"pus":n,"stomps":n,"supers":n}, "facts":["hattrick","cleansheet",...]}
-- Belohnung rechnet der Server. Tagesdeckel gegen Farmen.
create or replace function api.report_cpu_match(r jsonb, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p uuid := game.me(); prev jsonb; mode text := r->>'mode'; won boolean := coalesce((r->>'won')::boolean, false);
  goals integer := coalesce((r->>'goals')::integer, 0); conceded integer := coalesce((r->>'conceded')::integer, 0);
  dur integer := coalesce((r->>'duration')::integer, 0); diff integer := coalesce((r->>'diff')::integer, 1);
  head text := r->>'head'; base integer; coins integer; capped integer; cap integer; used integer; pr game.progress;
  gained_xp integer; ups jsonb; tasks_done jsonb; achs jsonb; facts text[]; st jsonb; s jsonb := coalesce(r->'stats', '{}');
  res jsonb; hx integer; farmed boolean := false; bonus integer := 0;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'cpu_match', 6, interval '1 minute');
  -- Plausibel?
  if mode is null or mode not in ('cpu', 'career', 'endless', 'daily', 'local', 'train') then perform game.fail('bad_mode'); end if;
  if dur < 15 or dur > 900 then perform game.fail('implausible', 'duration'); end if;
  if goals < 0 or goals > 30 or conceded < 0 or conceded > 30 then perform game.fail('implausible', 'score'); end if;
  if diff < 0 or diff > 3 then perform game.fail('implausible', 'diff'); end if;
  if goals > dur / 3 + 1 then perform game.fail('implausible', 'goal_rate'); end if;
  if won and goals <= conceded and mode <> 'endless' then perform game.fail('implausible', 'won'); end if;
  if head is null or not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  if exists (select 1 from jsonb_each_text(s) x where x.value !~ '^\d{1,3}$') then perform game.fail('implausible', 'stats'); end if;

  -- Münzen wie im Client, Faktor je Schwierigkeit
  base := case mode
    when 'local' then 20
    when 'train' then 5
    when 'endless' then case when won then 35 else 10 end
    else case when won then 40 else 12 end end;
  if mode in ('cpu', 'career', 'endless') then base := round(base * (game.cfg(('diff_mult'))->>diff)::numeric); end if;
  coins := base + goals * 8 + case when won and conceded = 0 then 20 else 0 end;

  -- Tagesdeckel
  select * into pr from game.progress where player_id = p for update;
  used := case when pr.cap_day = current_date then pr.cap_cpu_coins else 0 end;
  cap := game.cfg_int('cpu_daily_cap');
  -- bis zum Deckel voll, danach nur noch ein Anteil (used zählt alle heute erhaltenen Münzen)
  capped := least(coins, greatest(0, cap - used));
  capped := capped + round((coins - capped) * game.cfg_num('cpu_after_cap'));
  -- Harte Grenze gegen Bots: darüber gibt es heute gar nichts mehr (auch keine XP, Kopf-XP, Pass-Punkte)
  farmed := used >= game.cfg_int('cpu_hard_cap');
  if farmed then capped := 0; end if;

  -- Tages-Challenge: einmal am Tag die volle Belohnung, nicht gedeckelt
  if mode = 'daily' and won and (pr.challenge_day is null or pr.challenge_day < current_date) then
    update game.progress set challenge_day = current_date where player_id = p;
    perform game.book(p, 'gems', 15, 'challenge', current_date::text);
    bonus := 150;
  end if;

  update game.progress set cap_day = current_date, cap_cpu_coins = used + capped,
         stats = jsonb_build_object(
           'games', coalesce((stats->>'games')::integer, 0) + 1,
           'wins', coalesce((stats->>'wins')::integer, 0) + case when won then 1 else 0 end,
           'goals', coalesce((stats->>'goals')::integer, 0) + goals,
           'headGoals', coalesce((stats->>'headGoals')::integer, 0) + coalesce((s->>'headGoals')::integer, 0),
           'pus', coalesce((stats->>'pus')::integer, 0) + coalesce((s->>'pus')::integer, 0),
           'stomps', coalesce((stats->>'stomps')::integer, 0) + coalesce((s->>'stomps')::integer, 0),
           'supers', coalesce((stats->>'supers')::integer, 0) + coalesce((s->>'supers')::integer, 0),
           'endlessWins', coalesce((stats->>'endlessWins')::integer, 0) + case when won and mode = 'endless' then 1 else 0 end)
   where player_id = p;

  if capped + bonus > 0 then perform game.book(p, 'coins', capped + bonus, 'match_' || mode, request_key); end if;
  gained_xp := case when farmed then 0 else round((capped + bonus) * 1.2) + 15 end;
  ups := game.add_xp(p, gained_xp);
  hx := case when farmed then 0 when won then 30 else 15 end;
  update game.heads set xp = xp + hx, games = games + 1 where player_id = p and head_id = head;
  if not farmed then perform game.add_pass_points(p, case when won then 10 else 5 end); end if;

  tasks_done := game.progress_tasks(p, jsonb_build_object('wins', case when won then 1 else 0 end, 'goals', goals,
                 'headGoals', coalesce((s->>'headGoals')::integer, 0), 'supers', coalesce((s->>'supers')::integer, 0),
                 'pus', coalesce((s->>'pus')::integer, 0), 'stomps', coalesce((s->>'stomps')::integer, 0),
                 'hard', case when won and diff >= 2 and mode in ('cpu', 'career') then 1 else 0 end));
  facts := array(select jsonb_array_elements_text(coalesce(r->'facts', '[]')));
  facts := array(select f from unnest(facts) f where f in ('hattrick', 'cleansheet', 'supergoal', 'lastsec', 'longshot', 'comeback'));
  if won then facts := array_append(facts, 'firstwin'); end if;
  if won and conceded = 0 then facts := array_append(facts, 'cleansheet'); else facts := array_remove(facts, 'cleansheet'); end if;
  facts := array_remove(facts, 'hattrick'); if goals >= 3 then facts := array_append(facts, 'hattrick'); end if;
  if won and diff = 3 and mode = 'cpu' then facts := array_append(facts, 'legend'); end if;
  achs := game.grant_achievements(p, facts);

  res := jsonb_build_object('coins', capped + bonus, 'coinsBeforeCap', coins + bonus, 'capReached', farmed, 'xp', gained_xp, 'levelUps', ups, 'headXp', hx,
                            'tasksDone', tasks_done, 'achievements', achs, 'state', game.state_brief(p));
  return game.idem_end(p, request_key, res);
end $$;

-- ---------- Kaufen mit Münzen oder Juwelen ----------
create or replace function api.buy_item(item text, currency text, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); prev jsonb; it game.items; price integer; res jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'buy', 20, interval '1 minute');
  select * into it from game.items where id = item and active;
  if it.id is null then perform game.fail('unknown_item'); end if;
  price := case currency when 'coins' then it.price_coins when 'gems' then it.price_gems end;
  if price is null then perform game.fail('not_for_sale', currency); end if;
  if exists (select 1 from game.inventory where player_id = p and item_id = item) then perform game.fail('already_owned'); end if;
  if price > 0 then perform game.book(p, currency, -price, 'buy', item); end if;
  perform game.give_item(p, item, 'buy_' || currency);
  perform game.grant_achievements(p, '{}');
  res := jsonb_build_object('item', item, 'price', price, 'currency', currency, 'state', game.state_brief(p));
  return game.idem_end(p, request_key, res);
end $$;

-- ---------- Kopf leveln: Kopf-XP voll + Münzen; fehlende Kopf-XP mit Juwelen auffüllen ----------
create or replace function api.upgrade_head(head text, fill_with_gems boolean, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); prev jsonb; h game.heads; need integer; cost integer; missing integer; gems integer; res jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'upgrade', 30, interval '1 minute');
  select * into h from game.heads where player_id = p and head_id = head for update;
  if h.head_id is null then perform game.fail('head_not_owned'); end if;
  if h.level >= game.cfg_int('head_max_level') then perform game.fail('max_level'); end if;
  need := game.cfg_int('head_xp_per_level') * h.level;
  missing := greatest(0, need - h.xp);
  if missing > 0 then
    if not fill_with_gems then perform game.fail('not_enough_head_xp', missing::text); end if;
    gems := ceil(missing / 10.0) * game.cfg_int('head_gems_per_10xp');
    perform game.book(p, 'gems', -gems, 'head_xp', head);
  end if;
  cost := game.cfg_int('head_coins_per_level') * h.level;
  perform game.book(p, 'coins', -cost, 'head_level', head || ':' || (h.level + 1));
  update game.heads set level = level + 1, xp = greatest(0, xp - need) where player_id = p and head_id = head;
  res := jsonb_build_object('head', head, 'level', h.level + 1, 'coins', cost, 'gems', coalesce(gems, 0), 'state', game.state_brief(p));
  return game.idem_end(p, request_key, res);
end $$;

-- ---------- Saison-Pass ----------
create or replace function game.add_pass_points(p uuid, pts integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s integer := game.current_season();
begin
  if s is null or pts <= 0 then return; end if;
  insert into game.pass_progress as pp (player_id, season_id, points) values (p, s, pts)
  on conflict (player_id, season_id) do update set points = pp.points + pts;
end $$;

-- Belohnung einer Stufe: {"coins":n} | {"gems":n} | {"item":"id"}
create or replace function game.give_reward(p uuid, rw jsonb, why text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if rw ? 'coins' then perform game.book(p, 'coins', (rw->>'coins')::integer, why); end if;
  if rw ? 'gems' then perform game.book(p, 'gems', (rw->>'gems')::integer, why); end if;
  if rw ? 'item' then perform game.give_item(p, rw->>'item', why); end if;
end $$;

create or replace function api.claim_pass(tier integer, premium boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); s integer := game.current_season(); tiers jsonb; t jsonb; pp game.pass_progress; bit bigint;
begin
  if s is null then perform game.fail('no_season'); end if;
  select pass into tiers from game.seasons where id = s;
  if tier < 0 or tier >= jsonb_array_length(tiers) or tier > 62 then perform game.fail('bad_tier'); end if;
  t := tiers->tier;
  select * into pp from game.pass_progress where player_id = p and season_id = s for update;
  if pp.player_id is null or pp.points < (t->>'points')::integer then perform game.fail('not_reached'); end if;
  bit := (1::bigint << tier);
  if premium then
    if not pp.premium then perform game.fail('no_premium'); end if;
    if pp.claimed_premium & bit <> 0 then perform game.fail('already_claimed'); end if;
    update game.pass_progress set claimed_premium = claimed_premium | bit where player_id = p and season_id = s;
    perform game.give_reward(p, t->'premium', 'pass_premium');
  else
    if pp.claimed_free & bit <> 0 then perform game.fail('already_claimed'); end if;
    update game.pass_progress set claimed_free = claimed_free | bit where player_id = p and season_id = s;
    perform game.give_reward(p, t->'free', 'pass_free');
  end if;
  return game.state(p);
end $$;

-- Premium-Pass mit Juwelen (mit Geld: über api.grant_purchase)
create or replace function api.buy_pass_with_gems(request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); prev jsonb; s integer := game.current_season(); res jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  if s is null then perform game.fail('no_season'); end if;
  if exists (select 1 from game.pass_progress where player_id = p and season_id = s and premium) then perform game.fail('already_owned'); end if;
  perform game.book(p, 'gems', -500, 'pass', s::text);
  insert into game.pass_progress as pp (player_id, season_id, premium) values (p, s, true)
  on conflict (player_id, season_id) do update set premium = true;
  res := game.state(p);
  return game.idem_end(p, request_key, res);
end $$;

-- ---------- Alten Browser-Spielstand einmalig übernehmen (gedeckelt) ----------
create or replace function api.import_local(local jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); it text; c integer; done boolean;
begin
  select imported into done from game.progress where player_id = p for update;
  if done then perform game.fail('already_imported'); end if;
  if octet_length(local::text) > 65536 then perform game.fail('too_large'); end if;
  -- Nur Dinge, die man auch mit Münzen kaufen kann (keine Juwelen-Inhalte erschleichen)
  for it in select 'head:' || x from jsonb_array_elements_text(coalesce(local->'chars', '[]')) x
            union all select 'ball:' || x from jsonb_array_elements_text(coalesce(local->'balls', '[]')) x
            union all select 'arena:' || x from jsonb_array_elements_text(coalesce(local->'arenas', '[]')) x loop
    if exists (select 1 from game.items where id = it and price_coins is not null and active) then perform game.give_item(p, it, 'import'); end if;
  end loop;
  c := least(greatest(coalesce((local->>'coins')::integer, 0), 0), game.cfg_int('import_coin_cap'));
  perform game.book(p, 'coins', c, 'import');
  update game.progress set imported = true where player_id = p;
  if local ? 'name' and local->>'name' <> '' then
    begin perform api.set_name(left(local->>'name', 16)); exception when others then null; end;
  end if;
  return game.state(p);
end $$;

-- ---------- Rechte: nur angemeldete Spieler (auch anonyme Gäste) ----------
-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;

grant execute on function api.me(), api.set_name(text), api.set_prefs(jsonb), api.claim_daily(),
  api.report_cpu_match(jsonb, text), api.buy_item(text, text, text), api.upgrade_head(text, boolean, text),
  api.claim_pass(integer, boolean), api.buy_pass_with_gems(text), api.import_local(jsonb) to authenticated;
