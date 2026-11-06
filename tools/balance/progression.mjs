// Fortschritt simulieren (docs/PROGRESSION.md): Kisten pro Tag, Tage bis zum ersten legendären Kopf und bis zu allen Köpfen.
//   node tools/balance/progression.mjs   (Startwerte, ohne Shop-Käufe)
const HEADS = { selten: 3, episch: 4, legend: 2 };   // ohne die 3 Basis-Köpfe
const xpFor = l => 120 + (Math.min(l, 50) - 1) * 60;
const chestOf = l => l % 25 === 0 ? "legend" : l % 10 === 0 ? "gold" : l % 5 === 0 ? "silber" : "bronze";
// Chance auf einen Kopf je Kiste
const R = {
  bronze: { selten: .05, episch: .01, legend: .002 },
  silber: { selten: .12, episch: .05, legend: .01 },
  gold:   { selten: .25, episch: .18, legend: .06 },
  legend: { selten: 0, episch: .5, legend: .5 },
};
function run(matchesPerDay, taskDays, days = 180, seed = 1) {
  let a = seed * 2654435761 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const own = { selten: 0, episch: 0, legend: 0 };
  let lvl = 1, xp = 0, chests = 0, sinceHead = 0, sinceLeg = 0; const first = {}; let all = null;
  const give = (r, d) => { if (own[r] < HEADS[r]) { own[r]++; sinceHead = 0; if (!first[r]) first[r] = d; if (r === "legend") sinceLeg = 0; return true; } return false; };
  const open = (c, d) => {
    chests++; sinceHead++; sinceLeg++;
    const x = rnd(); let got = null; const r = R[c];
    if (x < r.legend) got = "legend"; else if (x < r.legend + r.episch) got = "episch"; else if (x < r.legend + r.episch + r.selten) got = "selten";
    if (got) give(got, d);
    if (sinceLeg >= 90) { give("legend", d) || 0; sinceLeg = 0; }
    if (sinceHead >= 50) { for (const k of ["selten", "episch", "legend"]) if (give(k, d)) break; }
  };
  for (let d = 1; d <= days; d++) {
    for (let m = 0; m < matchesPerDay; m++) { xp += 70; while (xp >= xpFor(lvl)) { xp -= xpFor(lvl); lvl++; if (lvl === 2) give("selten", d); else if (lvl === 5) give("episch", d); else open(chestOf(lvl), d); } }
    if (rnd() < taskDays) open("bronze", d);
    if (rnd() < taskDays * 0.8) open("bronze", d);   // Tages-Challenge gewonnen
    if (d % 7 === 0 && rnd() < taskDays) open("silber", d);
    if (!all && own.selten + own.episch + own.legend === 9) all = d;
  }
  return { lvl, chestsPerDay: (chests / days).toFixed(2), firstLegend: first.legend, all, lvl30: null };
}
for (const [name, m, tk] of [["aktiv (12 Spiele/Tag)", 12, .9], ["gelegentlich (4 Spiele/Tag)", 4, .4]]) {
  const res = Array.from({ length: 200 }, (_, i) => run(m, tk, 180, i + 7));
  const med = k => { const v = res.map(r => r[k] ?? 999).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  console.log(name, "Kisten/Tag", res[0].chestsPerDay, "Level nach 180 T", med("lvl"), "erster legend. Kopf (Median, Tag)", med("firstLegend"), "alle Köpfe (Median, Tag)", med("all"));
}
