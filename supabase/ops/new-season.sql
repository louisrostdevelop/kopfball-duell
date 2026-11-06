-- Nächste Saison anlegen (SQL-Editor oder psql). Beginnt, wenn die letzte endet (oder sofort, falls keine läuft),
-- dauert 28 Tage. Man kann also schon vorher planen. Die Wertung startet pro Saison neu.
-- Pass-Stufen: Punkte und Belohnungen für Gratis- und Premium-Stufe ({"coins":n} | {"gems":n} | {"item":"art:id"} | {"chest":"bronze|silver|gold|legend"}).
insert into game.seasons (id, starts_at, ends_at, pass) values (
  (select coalesce(max(id), 0) + 1 from game.seasons),
  greatest(date_trunc('day', now()), (select max(ends_at) from game.seasons)),
  greatest(date_trunc('day', now()), (select max(ends_at) from game.seasons)) + interval '28 days',
  '[{"points":0,"free":{"coins":50},"premium":{"gems":30}},
    {"points":60,"free":{"coins":100},"premium":{"gems":30}},
    {"points":140,"free":{"chest":"bronze"},"premium":{"chest":"gold"}},
    {"points":240,"free":{"coins":150},"premium":{"item":"ball:gold"}},
    {"points":360,"free":{"coins":200},"premium":{"chest":"gold"}},
    {"points":500,"free":{"chest":"silver"},"premium":{"gems":100}}]'
);
