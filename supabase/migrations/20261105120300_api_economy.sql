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
  perform game.ensure_weekly(p);   -- Wochenaufgaben gleich sichtbar (schreibt nur einmal pro Woche)
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
  if pr.daily_last = game.today() then perform game.fail('already_claimed'); end if;
  streak := case when pr.daily_last = game.today() - 1 then least(7, pr.daily_streak + 1) else 1 end;
  amount := 20 + streak * 15;   -- wie dailyBonus in js/core/economy.js
  update game.progress set daily_last = game.today(), daily_streak = streak where player_id = p;
  perform game.book(p, 'coins', amount, 'daily', game.today()::text);
  return jsonb_build_object('amount', amount, 'streak', streak, 'state', game.state_brief(p));
end $$;

-- ---------- Tagesaufgaben für heute (für alle gleich, aus dem Datum bestimmt) ----------
create or replace function game.ensure_tasks(p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t jsonb;
begin
  select tasks into t from game.progress where player_id = p and tasks_day = game.today();
  if t is not null then return t; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'n', d.goals[1 + ((hashtext(d.id || game.today()::text)::bigint % array_length(d.goals, 1)) + array_length(d.goals, 1)) % array_length(d.goals, 1)],
                                               'prog', 0, 'done', false, 'reward', d.reward) order by md5(game.today()::text || d.id)), '[]')
    into t
    from (select * from game.task_defs where active order by md5(game.today()::text || id) limit 3) d;
  update game.progress set tasks = t, tasks_day = game.today() where player_id = p;
  return t;
end $$;

-- ---------- Wochenaufgaben: 5 pro Woche (für alle gleich), alle 5 = Silber-Kiste ----------
create or replace function game.ensure_weekly(p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w jsonb; wk text := game.week();
begin
  select weekly into w from game.progress where player_id = p;
  if w->>'week' = wk then return w; end if;
  select jsonb_build_object('week', wk, 'heads', '[]'::jsonb, 'list', coalesce(jsonb_agg(jsonb_build_object('id', d->>'id', 'n', (d->>'n')::integer, 'prog', 0, 'done', false,
           'reward', (d->>'reward')::integer) order by md5(wk || (d->>'id'))), '[]'))
    into w from (select d from jsonb_array_elements(game.cfg('weekly_defs')) d order by md5(wk || (d->>'id')) limit 5) x;
  update game.progress set weekly = w where player_id = p;
  return w;
end $$;
-- inc: {"wins":1,"goals":3,"career":1,"online":1,"clean":1,...}; head: gespielter Kopf (für "verschiedene Köpfe")
create or replace function game.progress_weekly(p uuid, inc jsonb, head text) returns void
language plpgsql security definer set search_path = '' as $$
declare w jsonb := game.ensure_weekly(p); heads jsonb := coalesce(w->'heads', '[]'); out jsonb := '[]'; e jsonb; prog integer; fresh boolean := false;
begin
  if head is not null and not heads ? head then heads := heads || to_jsonb(head); end if;
  for e in select * from jsonb_array_elements(w->'list') loop
    if not (e->>'done')::boolean then
      prog := least((e->>'n')::integer, case when e->>'id' = 'heads' then jsonb_array_length(heads) else (e->>'prog')::integer + coalesce((inc->>(e->>'id'))::integer, 0) end);
      if prog <> (e->>'prog')::integer then e := jsonb_set(e, '{prog}', to_jsonb(prog)); end if;
      if prog >= (e->>'n')::integer then
        e := jsonb_set(e, '{done}', 'true'); fresh := true;
        perform game.book(p, 'coins', (e->>'reward')::integer, 'weekly', (w->>'week') || ':' || (e->>'id'));
      end if;
    end if;
    out := out || e;
  end loop;
  if out is distinct from w->'list' or heads is distinct from w->'heads' then
    update game.progress set weekly = jsonb_build_object('week', w->>'week', 'heads', heads, 'list', out) where player_id = p;
  end if;
  if fresh and not exists (select 1 from jsonb_array_elements(out) x where not (x->>'done')::boolean) then
    perform game.grant_chest(p, 'silver', 'weekly', w->>'week');
  end if;
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
  if out is distinct from t then update game.progress set tasks = out where player_id = p; end if;
  -- Alle Tagesaufgaben geschafft: Bronze-Kiste (einmal am Tag)
  if jsonb_array_length(done) > 0 and not exists (select 1 from jsonb_array_elements(out) x where not (x->>'done')::boolean) then
    perform game.grant_chest(p, 'bronze', 'tasks', game.today()::text);
  end if;
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
      if a.chest is not null then perform game.grant_chest(p, a.chest, 'ach', a.id); end if;
      if a.item is not null then perform game.give_item(p, a.item, 'ach'); end if;
      got := got || to_jsonb(a.id);
    end if;
  end loop;
  if jsonb_array_length(got) > 0 then update game.progress set achievements = ach where player_id = p; end if;
  return got;
end $$;

-- ---------- Spiel gegen den Computer melden ----------
-- r: {"mode":"cpu|career|endless|daily|local|train","won":bool,"goals":n,"conceded":n,"duration":s,"head":"head:kalle","diff":0-3,
--     "cup":bool, "stage":"district.0" (Karriere), "stats":{"headGoals":n,"pus":n,"stomps":n,"supers":n}, "facts":["supergoal","lastsec",...]}
-- Belohnung rechnet der Server. Gegen Farmen:
--  - Zeitkonto: gemeldete Spielzeit kann nicht schneller vergehen als echte Zeit (Vorrat cpu_time_bank für Nachgereichtes)
--  - Tagesdeckel für Münzen (weich, dann hart) und für belohnte Spiele (cpu_daily_matches), danach gibt es nichts mehr
--  - Statistik und Erfolge müssen zum Ergebnis passen; Training gibt keine Belohnung
create or replace function api.report_cpu_match(r jsonb, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p uuid := game.me(); prev jsonb; mode text := r->>'mode'; won boolean := coalesce((r->>'won')::boolean, false);
  goals integer := coalesce((r->>'goals')::integer, 0); conceded integer := coalesce((r->>'conceded')::integer, 0);
  dur integer := coalesce((r->>'duration')::integer, 0); diff integer := coalesce((r->>'diff')::integer, 1);
  head text := r->>'head'; base integer; coins integer; capped integer; cap integer; used integer; pr game.progress;
  gained_xp integer; ups jsonb; tasks_done jsonb; achs jsonb; facts text[]; s jsonb := coalesce(r->'stats', '{}');
  res jsonb; hx integer; farmed boolean := false; bonus integer := 0; today date := game.today();
  hg integer; sup integer; pus integer; stomps integer; credit numeric; matches integer; challenge boolean := false;
  streak integer; best integer; ended integer := null;
  cs game.career_stages; car jsonb; paid text[]; stars integer; open boolean; lg game.career_leagues; cres jsonb := null; mast jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'cpu_match', 20, interval '1 minute');   -- Offline Gespieltes kommt gebündelt
  -- Plausibel?
  if mode is null or mode not in ('cpu', 'career', 'endless', 'daily', 'local', 'train') then perform game.fail('bad_mode'); end if;
  if dur < 15 or dur > 900 then perform game.fail('implausible', 'duration'); end if;
  if goals < 0 or goals > 30 or conceded < 0 or conceded > 30 then perform game.fail('implausible', 'score'); end if;
  if diff < 0 or diff > 3 then perform game.fail('implausible', 'diff'); end if;
  if goals > dur / 3 + 1 then perform game.fail('implausible', 'goal_rate'); end if;
  if won and goals <= conceded then perform game.fail('implausible', 'won'); end if;
  if head is null or not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  if exists (select 1 from jsonb_each_text(s) x where x.value !~ '^\d{1,3}$') then perform game.fail('implausible', 'stats'); end if;
  hg := coalesce((s->>'headGoals')::integer, 0); sup := coalesce((s->>'supers')::integer, 0);
  pus := coalesce((s->>'pus')::integer, 0); stomps := coalesce((s->>'stomps')::integer, 0);
  if hg > goals or pus > dur / 3 + 2 or stomps > dur / 2 + 2 or sup > dur / 8 + 3 then perform game.fail('implausible', 'stats'); end if;

  select * into pr from game.progress where player_id = p for update;
  -- Zeitkonto (Sekunden): wächst mit der echten Zeit bis zum Vorrat, jedes Spiel kostet seine Dauer
  credit := least(game.cfg_int('cpu_time_bank'), coalesce(pr.cpu_credit, game.cfg_int('cpu_time_bank')) + extract(epoch from now() - coalesce(pr.last_cpu_at, now())));
  if credit < dur * 0.8 then perform game.fail('implausible', 'too_fast'); end if;

  -- Münzen wie im Client, Faktor je Schwierigkeit
  base := case mode
    when 'local' then 12
    when 'train' then 0
    when 'endless' then case when won then 21 else 6 end
    else case when won then 24 else 7 end end;
  if mode in ('cpu', 'career', 'endless') then base := round(base * (game.cfg(('diff_mult'))->>diff)::numeric); end if;
  coins := case when mode = 'train' then 0 else base + goals * 5 + case when won and conceded = 0 then 12 else 0 end end;

  -- Tagesdeckel: bis zum Deckel voll, danach nur noch ein Anteil; ab der harten Grenze oder zu vielen Spielen nichts mehr
  used := case when pr.cap_day = today then pr.cap_cpu_coins else 0 end;
  matches := case when pr.cap_day = today then pr.cap_matches else 0 end;
  cap := game.cfg_int('cpu_daily_cap');
  capped := least(coins, greatest(0, cap - used));
  capped := capped + round((coins - capped) * game.cfg_num('cpu_after_cap'));
  farmed := used >= game.cfg_int('cpu_hard_cap') or matches >= game.cfg_int('cpu_daily_matches') or mode = 'train';
  if farmed then capped := 0; end if;

  -- Tages-Challenge: einmal am Tag die volle Belohnung, nicht gedeckelt
  if mode = 'daily' and won and (pr.challenge_day is null or pr.challenge_day < today) then
    challenge := true; bonus := 150;
    perform game.book(p, 'gems', 5, 'challenge', today::text);
    perform game.grant_chest(p, 'bronze', 'challenge', today::text);
  end if;

  -- Endlos: Serie zählt der Server mit; endet sie, kommt sie in die Bestenliste
  streak := coalesce(pr.endless_streak, 0); best := coalesce(pr.endless_best, 0);
  if mode = 'endless' then
    if won then streak := streak + 1; else ended := streak; best := greatest(best, streak); streak := 0; end if;
  end if;

  -- Karriere: Sterne nur für freigeschaltete Spiele mit der richtigen Schwierigkeit; Liga komplett = Bonus, einmal
  car := pr.career; paid := pr.career_paid;
  if mode = 'career' then
    select * into cs from game.career_stages where id = r->>'stage';
    if cs.id is null or cs.diff <> diff then perform game.fail('implausible', 'stage'); end if;
    open := case when cs.idx > 0 then coalesce((car->>(cs.league || '.' || (cs.idx - 1)))::integer, 0) > 0
                 else not exists (select 1 from game.career_leagues l join game.career_stages x on x.league = l.id
                                   where l.ord = (select ord from game.career_leagues where id = cs.league) - 1
                                     and coalesce((car->>x.id)::integer, 0) = 0) end;
    stars := case when not won then 0 when conceded = 0 then 3 when goals - conceded >= 2 then 2 else 1 end;
    if open and stars > coalesce((car->>cs.id)::integer, 0) then car := car || jsonb_build_object(cs.id, stars); end if;
    cres := jsonb_build_object('stage', cs.id, 'open', open, 'stars', stars, 'best', coalesce((car->>cs.id)::integer, 0));
    if open and not (cs.league = any(paid))
       and not exists (select 1 from game.career_stages x where x.league = cs.league and coalesce((car->>x.id)::integer, 0) = 0) then
      select * into lg from game.career_leagues where id = cs.league;
      paid := array_append(paid, cs.league);
      if lg.coins > 0 then perform game.book(p, 'coins', lg.coins, 'career_league', cs.league); end if;
      if lg.gems > 0 then perform game.book(p, 'gems', lg.gems, 'career_league', cs.league); end if;
      if lg.chest is not null then perform game.grant_chest(p, lg.chest, 'career', cs.league); end if;
      cres := cres || jsonb_build_object('bonus', jsonb_build_object('league', cs.league, 'coins', lg.coins, 'gems', lg.gems, 'chest', lg.chest));
    end if;
  end if;

  -- Ein Schreibvorgang für den Fortschritt
  update game.progress set cap_day = today, cap_cpu_coins = used + capped, cap_matches = matches + 1,
         cpu_credit = credit - dur, last_cpu_at = now(),
         challenge_day = case when challenge then today else challenge_day end,
         endless_streak = streak, endless_best = best, career = car, career_paid = paid,
         -- Statistik (Erfolge mit Zielwert) zählt nur belohnte Spiele: sonst ließen sich alle Erfolgs-Stufen an einem Tag erschleichen
         stats = case when farmed then stats else jsonb_build_object(
           'games', coalesce((stats->>'games')::integer, 0) + 1,
           'wins', coalesce((stats->>'wins')::integer, 0) + case when won then 1 else 0 end,
           'goals', coalesce((stats->>'goals')::integer, 0) + goals,
           'headGoals', coalesce((stats->>'headGoals')::integer, 0) + hg,
           'pus', coalesce((stats->>'pus')::integer, 0) + pus,
           'stomps', coalesce((stats->>'stomps')::integer, 0) + stomps,
           'supers', coalesce((stats->>'supers')::integer, 0) + sup,
           'endlessWins', coalesce((stats->>'endlessWins')::integer, 0) + case when won and mode = 'endless' then 1 else 0 end) end
   where player_id = p;
  if ended is not null and ended > 0 then perform game.put_score(p, 'endless', ended); end if;

  if capped + bonus > 0 then perform game.book(p, 'coins', capped + bonus, 'match_' || mode, request_key); end if;
  -- XP: doppelt die Spiel-Münzen (seit docs/BALANCE.md weniger Münzen, Level gleich schnell), Challenge-Bonus wie bisher
  gained_xp := case when farmed then 0 else round(capped * 2 + bonus * 1.2) + 15 end;
  ups := game.add_xp(p, gained_xp);
  hx := case when farmed then 0 when won then 60 else 30 end;
  update game.heads set xp = xp + hx, games = games + 1 where player_id = p and head_id = head;
  mast := case when farmed then '[]'::jsonb else game.progress_mastery(p, head, won, goals, sup) end;
  if not farmed then perform game.add_pass_points(p, case when won then 10 else 5 end); end if;

  tasks_done := '[]';
  if not farmed then
    tasks_done := game.progress_tasks(p, jsonb_build_object('wins', case when won then 1 else 0 end, 'goals', goals,
                   'headGoals', hg, 'supers', sup, 'pus', pus, 'stomps', stomps,
                   'hard', case when won and diff >= 2 and mode in ('cpu', 'career') then 1 else 0 end,
                   'cupRound', case when won and mode = 'cpu' and coalesce((r->>'cup')::boolean, false) then 1 else 0 end));
    perform game.progress_weekly(p, jsonb_build_object('wins', case when won then 1 else 0 end, 'goals', goals, 'supers', sup, 'headGoals', hg,
                   'career', case when mode = 'career' then 1 else 0 end, 'clean', case when won and conceded = 0 then 1 else 0 end), head);
  end if;
  -- Erfolge: nur was zum Ergebnis passt
  facts := array(select jsonb_array_elements_text(coalesce(r->'facts', '[]')));
  facts := array(select f from unnest(facts) f where (f in ('supergoal', 'lastsec', 'longshot') and goals >= 1) or (f = 'comeback' and won and conceded >= 2));
  if won then facts := array_append(facts, 'firstwin'); end if;
  if won and conceded = 0 then facts := array_append(facts, 'cleansheet'); end if;
  if goals >= 3 then facts := array_append(facts, 'hattrick'); end if;
  if won and diff = 3 and mode = 'cpu' then facts := array_append(facts, 'legend'); end if;
  achs := case when farmed then '[]'::jsonb else game.grant_achievements(p, facts) end;

  res := jsonb_build_object('coins', capped + bonus, 'coinsBeforeCap', coins + bonus, 'capReached', farmed, 'xp', gained_xp, 'levelUps', ups, 'headXp', hx,
                            'tasksDone', tasks_done, 'achievements', achs, 'career', cres, 'mastery', mast, 'state', game.state_brief(p));
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
  -- Seltenes erst ab einem Level; Kosmetik nur im Wochenangebot
  if (select level from game.players where id = p) < coalesce((game.cfg('shop_level')->>it.rarity)::integer, 1) then
    perform game.fail('level_required', (game.cfg('shop_level')->>it.rarity));
  end if;
  if it.kind in ('shoes', 'goalfx', 'emote', 'emoji') and not (item = any(game.cos_offer())) then perform game.fail('not_in_offer'); end if;
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
    if not coalesce(fill_with_gems, false) then perform game.fail('not_enough_head_xp', missing::text); end if;
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
create or replace function game.give_reward(p uuid, rw jsonb, why text, ref text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if rw ? 'chest' then perform game.grant_chest(p, rw->>'chest', why, coalesce(ref, gen_random_uuid()::text)); end if;
  if rw ? 'coins' then perform game.book(p, 'coins', (rw->>'coins')::integer, why); end if;
  if rw ? 'gems' then perform game.book(p, 'gems', (rw->>'gems')::integer, why); end if;
  -- Gegenstand schon im Besitz: 200 Münzen statt nichts
  if rw ? 'item' and not game.give_item(p, rw->>'item', why) then perform game.book(p, 'coins', 200, why || '_dup', rw->>'item'); end if;
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
    perform game.give_reward(p, t->'premium', 'pass_premium', s || ':' || tier);
  else
    if pp.claimed_free & bit <> 0 then perform game.fail('already_claimed'); end if;
    update game.pass_progress set claimed_free = claimed_free | bit where player_id = p and season_id = s;
    perform game.give_reward(p, t->'free', 'pass_free', s || ':' || tier);
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
  -- Zeile anlegen und sperren, dann prüfen: so kann der Kauf auch gleichzeitig nur einmal abbuchen
  insert into game.pass_progress (player_id, season_id) values (p, s) on conflict do nothing;
  if (select premium from game.pass_progress where player_id = p and season_id = s for update) then perform game.fail('already_owned'); end if;
  perform game.book(p, 'gems', -500, 'pass', s::text);
  update game.pass_progress set premium = true where player_id = p and season_id = s;
  res := game.state(p);
  return game.idem_end(p, request_key, res);
end $$;

-- ---------- Alten Browser-Spielstand einmalig übernehmen (gedeckelt) ----------
-- Einmalig den Spielstand aus der Zeit ohne Server übernehmen. Weil der lokale Stand frei änderbar ist:
--  - nur in den ersten 24 h eines Kontos
--  - Gegenstände (nur Münz-Inhalte) und Münzen zusammen höchstens import_coin_cap wert, billigste zuerst
create or replace function api.import_local(local jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); it record; budget integer := game.cfg_int('import_coin_cap'); c integer; done boolean; born timestamptz;
begin
  select pr.imported, pl.created_at into done, born from game.progress pr join game.players pl on pl.id = pr.player_id where pr.player_id = p for update of pr;
  if done then perform game.fail('already_imported'); end if;
  if born < now() - interval '24 hours' then perform game.fail('import_too_late'); end if;
  if octet_length(local::text) > 65536 then perform game.fail('too_large'); end if;
  for it in select i.id, i.price_coins from game.items i
             where i.active and i.price_coins is not null and i.price_coins > 0
               and i.id in (select 'head:' || x from jsonb_array_elements_text(coalesce(local->'chars', '[]')) x
                            union select 'ball:' || x from jsonb_array_elements_text(coalesce(local->'balls', '[]')) x
                            union select 'arena:' || x from jsonb_array_elements_text(coalesce(local->'arenas', '[]')) x)
               and not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id)
             order by i.price_coins loop
    exit when it.price_coins > budget;
    perform game.give_item(p, it.id, 'import');
    budget := budget - it.price_coins;
  end loop;
  -- Startguthaben hat das Server-Konto schon: nur was darüber hinaus lokal erspielt wurde, im Rest des Budgets
  c := least(greatest(coalesce((local->>'coins')::integer, 0) - game.cfg_int('start_coins'), 0), budget);
  perform game.book(p, 'coins', c, 'import');
  -- Karriere: Sterne übernehmen (nur gültige Spiele, 1-3); schon komplette Ligen bringen keinen Bonus mehr
  update game.progress pr set imported = true,
    career = pr.career || coalesce((select jsonb_object_agg(s.id, (local->'career'->>s.id)::integer) from game.career_stages s
                                     where (local->'career'->>s.id) ~ '^[123]$'), '{}'),
    career_paid = array(select distinct unnest(pr.career_paid || array(select l.id from game.career_leagues l
                    where not exists (select 1 from game.career_stages x where x.league = l.id and coalesce(local->'career'->>x.id, '') !~ '^[123]$'))))
   where pr.player_id = p;
  if local ? 'name' and local->>'name' <> '' then
    begin perform api.set_name(left(local->>'name', 16)); exception when others then null; end;
  end if;
  return game.state(p);
end $$;

-- ---------- Konto löschen (DSGVO): alle Spielerdaten weg, Käufe bleiben ohne Personenbezug ----------
create or replace function api.delete_account(confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  if confirm is distinct from 'DELETE' then perform game.fail('confirm_required'); end if;
  insert into game.erasures (user_id) values (p) on conflict do nothing;
  delete from game.match_queue where player_id = p;
  delete from auth.users where id = p;   -- löscht über Fremdschlüssel alle game-Daten mit
  return jsonb_build_object('deleted', true);
end $$;

-- ---------- Rechte: nur angemeldete Spieler (auch anonyme Gäste) ----------
-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;

grant execute on function api.me(), api.set_name(text), api.set_prefs(jsonb), api.claim_daily(),
  api.report_cpu_match(jsonb, text), api.buy_item(text, text, text), api.upgrade_head(text, boolean, text),
  api.claim_pass(integer, boolean), api.buy_pass_with_gems(text), api.import_local(jsonb), api.delete_account(text) to authenticated;
