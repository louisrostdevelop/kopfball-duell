-- Nur für die lokale Entwicklung (supabase db reset): eine laufende Saison mit Pass-Stufen.
-- Auf dem echten Projekt legt man Saisons mit supabase/ops/new-season.sql an.
insert into game.seasons (id, starts_at, ends_at, pass) values (
  1, now() - interval '1 day', now() + interval '27 days',
  '[{"points":0,"free":{"coins":50},"premium":{"gems":30}},
    {"points":50,"free":{"coins":100},"premium":{"gems":30}},
    {"points":120,"free":{"chest":"bronze"},"premium":{"chest":"gold"}},
    {"points":200,"free":{"coins":150},"premium":{"item":"ball:gold"}},
    {"points":300,"free":{"coins":200},"premium":{"chest":"gold"}}]'
) on conflict (id) do nothing;
