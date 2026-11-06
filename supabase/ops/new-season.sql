-- Nächste Saison anlegen (SQL-Editor oder psql). Beginnt, wenn die letzte endet (oder sofort, falls keine läuft),
-- dauert 28 Tage. Man kann also schon vorher planen. Die Wertung startet pro Saison neu.
-- Pass-Stufen: Punkte und Belohnungen für Gratis- und Premium-Stufe (Rahmen: frame:pass-net/-turf/-flood/-neon gratis, -pixel/-flame Premium) ({"coins":n} | {"gems":n} | {"item":"art:id"} | {"chest":"bronze|silver|gold|legend"}).
-- Letzte Stufe (950 Punkte, gratis): die neue Arena dieser Saison (ARENAS mit season in js/content/config.js, danach im
-- Shop); gibt es für die Saison keine, eine Gold-Kiste.
with n as (
  select coalesce(max(id), 0) + 1 as id, greatest(date_trunc('day', now()), max(ends_at)) as st from game.seasons
)
insert into game.seasons (id, starts_at, ends_at, pass)
select n.id, n.st, n.st + interval '28 days',
  '[{"points":0,"free":{"coins":50},"premium":{"gems":30}},
    {"points":60,"free":{"item":"frame:pass-net"},"premium":{"gems":30}},
    {"points":140,"free":{"chest":"bronze"},"premium":{"chest":"gold"}},
    {"points":240,"free":{"coins":150},"premium":{"item":"frame:pass-pixel"}},
    {"points":360,"free":{"item":"frame:pass-turf"},"premium":{"chest":"gold"}},
    {"points":500,"free":{"chest":"silver"},"premium":{"item":"ball:gold"}},
    {"points":650,"free":{"item":"frame:pass-flood"},"premium":{"gems":100}},
    {"points":800,"free":{"item":"frame:pass-neon"},"premium":{"item":"frame:pass-flame"}}]'::jsonb
  || jsonb_build_array(jsonb_build_object('points', 950, 'premium', '{"gems":50}'::jsonb, 'free',
       case n.id when 1 then '{"item":"arena:vulkan"}'::jsonb when 2 then '{"item":"arena:skate"}'::jsonb
                 when 3 then '{"item":"arena:tiefsee"}'::jsonb when 4 then '{"item":"arena:backrooms"}'::jsonb
                 else '{"chest":"gold"}'::jsonb end))
from n;
