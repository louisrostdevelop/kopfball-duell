-- Grundlage: Migrationen sind da, Katalog geladen
do $$ begin
  assert (select count(*) from game.items where kind = 'head') = 22, 'Köpfe im Katalog';
  assert (select count(*) from game.task_defs) = 9, 'Aufgaben';
  assert (select count(*) from game.achievement_defs) = 26, 'Erfolge';
end $$;
