-- ERZEUGT von tools/gen-catalog.mjs aus js/content und js/core/economy.js. Nicht von Hand ändern.
-- Idempotent: kann beliebig oft eingespielt werden (fügt hinzu und aktualisiert, löscht nichts).
begin;
insert into game.items (id, kind, rarity, price_coins, price_gems, meta) values
  ('head:kalle', 'head', 'basis', 0, null, '{"name":"Kalle","super":"fire"}'::jsonb),
  ('head:yuki', 'head', 'basis', 0, null, '{"name":"Yuki","super":"ice"}'::jsonb),
  ('head:bolt', 'head', 'basis', 0, null, '{"name":"Bolt","super":"thunder"}'::jsonb),
  ('head:rocco', 'head', 'selten', 200, 300, '{"name":"Rocco","super":"rocket"}'::jsonb),
  ('head:nala', 'head', 'selten', 250, 300, '{"name":"Nala","super":"banana"}'::jsonb),
  ('head:flummi', 'head', 'selten', 300, 300, '{"name":"Flummi","super":"bouncy"}'::jsonb),
  ('head:phantom', 'head', 'episch', 350, 450, '{"name":"Phantom","super":"ghost"}'::jsonb),
  ('head:tank', 'head', 'episch', 400, 450, '{"name":"Tank","super":"giant"}'::jsonb),
  ('head:tina', 'head', 'episch', 450, 450, '{"name":"Tina","super":"tornado"}'::jsonb),
  ('head:magnus', 'head', 'episch', 500, 450, '{"name":"Magnus","super":"magnet"}'::jsonb),
  ('head:max', 'head', 'legend', 600, 600, '{"name":"Max","super":"meteor"}'::jsonb),
  ('head:kaiser', 'head', 'legend', 900, 600, '{"name":"Kaiser","super":"clone"}'::jsonb),
  ('ball:klassik', 'ball', 'basis', 0, null, '{"name":"Klassik"}'::jsonb),
  ('ball:retro', 'ball', 'selten', 100, null, '{"name":"Leder"}'::jsonb),
  ('ball:beach', 'ball', 'selten', 150, null, '{"name":"Wasserball"}'::jsonb),
  ('ball:neon', 'ball', 'selten', 200, null, '{"name":"Neon"}'::jsonb),
  ('ball:pixel', 'ball', 'selten', 200, null, '{"name":"Pixel"}'::jsonb),
  ('ball:planet', 'ball', 'selten', 300, null, '{"name":"Planet"}'::jsonb),
  ('ball:disco', 'ball', 'episch', 350, null, '{"name":"Disco"}'::jsonb),
  ('ball:gold', 'ball', 'legend', 600, null, '{"name":"Gold"}'::jsonb),
  ('arena:stadion', 'arena', 'basis', 0, null, '{"name":"Flutlicht"}'::jsonb),
  ('arena:strand', 'arena', 'basis', 0, null, '{"name":"Strand"}'::jsonb),
  ('arena:neon', 'arena', 'selten', 300, null, '{"name":"Neon City"}'::jsonb),
  ('arena:eis', 'arena', 'episch', 400, null, '{"name":"Eishalle"}'::jsonb),
  ('arena:mond', 'arena', 'legend', 600, null, '{"name":"Mond"}'::jsonb)
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price_coins = excluded.price_coins, price_gems = excluded.price_gems, meta = excluded.meta, active = true;
insert into game.products (id, gems, items, price_cents, once_per_player) values
  ('gems_100', 100, array[]::text[], 99, false),
  ('gems_550', 550, array[]::text[], 499, false),
  ('gems_1200', 1200, array[]::text[], 999, false),
  ('gems_2600', 2600, array[]::text[], 1999, false),
  ('premium_pass', 0, array['premium_pass']::text[], 499, false),
  ('starter', 300, array[]::text[], 299, true)
on conflict (id) do update set gems = excluded.gems, items = excluded.items, price_cents = excluded.price_cents, once_per_player = excluded.once_per_player, active = true;
insert into game.task_defs (id, goals, reward) values
  ('wins', array[2, 3], 80),
  ('goals', array[5, 8], 60),
  ('headGoals', array[2, 3], 80),
  ('supers', array[3, 5], 60),
  ('pus', array[3, 5], 60),
  ('stomps', array[2, 3], 70),
  ('online', array[1], 90),
  ('hard', array[1], 100),
  ('cupRound', array[2], 80)
on conflict (id) do update set goals = excluded.goals, reward = excluded.reward, active = true;
insert into game.achievement_defs (id, reward, stat, goal) values
  ('firstwin', 50, null, null),
  ('hattrick', 80, null, null),
  ('cleansheet', 80, null, null),
  ('header10', 120, 'headGoals', 10),
  ('supergoal', 60, null, null),
  ('lastsec', 100, null, null),
  ('longshot', 80, null, null),
  ('comeback', 150, null, null),
  ('cup', 200, null, null),
  ('legend', 250, null, null),
  ('online', 100, null, null),
  ('collector', 150, null, null),
  ('powerups', 100, 'pus', 25),
  ('goals50', 200, 'goals', 50),
  ('stomp', 80, 'stomps', 10),
  ('wins25', 300, 'wins', 25)
on conflict (id) do update set reward = excluded.reward, stat = excluded.stat, goal = excluded.goal;
commit;
