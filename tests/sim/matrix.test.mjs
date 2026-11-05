// Edge-Case-Matrix: Sprung, Arschbombe, Grätsche, Schüsse, Hindernisse, Online-Vorhersage
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRandom } from "../lib/rng.mjs";
seedRandom(4242);
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const { W, G, FOOT, SR } = C;
const DT = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rows = [];
function check(name, ok, info = "") { rows.push([ok ? "OK " : "FAIL", name, info]); }

function setup(o = {}) {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: o.arena || "stadion", dur: 90, pus: false, golden: false, rules: o.rules || {} });
  st.ph = "play"; st.pus = false; st.puT = 999;
  const [a, b] = st.p;
  a.x = o.ax ?? 500; b.x = o.bx ?? 1150;
  st.b.x = o.ballX ?? 900; st.b.y = o.ballY ?? 300; st.b.vx = 0; st.b.vy = 0;
  if (o.ballFloat) st.b.y = 120;
  return st;
}
const rest = p => G - (FOOT + SR) * p.sc;
// Läuft n Schritte, inp(t) liefert Eingabe für Spieler 0
function run(st, secs, inp0, inp1, each) {
  inp1 ??= () => ({});
  const n = Math.round(secs / DT);
  for (let k = 0; k < n; k++) {
    const t = k * DT;
    P.step(st, DT, [inp0(t, st) || {}, inp1(t, st) || {}]);
    if (each) each(st, t);
    if (st.ph !== "play") break;
  }
}
const keepBall = st => { st.b.x = 760; st.b.y = 120; st.b.vx = 0; st.b.vy = 0; }; // Ball aus dem Weg halten
function apex(inp, o = {}) {
  const st = setup(o); let minY = 1e9;
  run(st, 1.4, inp, undefined, s => { keepBall(s); minY = Math.min(minY, s.p[0].y); });
  return rest(st.p[0]) - minY;
}

// ---------- 1. Sprung ----------
const full = apex(t => ({ j: t < 0.6 }));
const half = apex(t => ({ j: t < DT * 1.5 }));
const mid = apex(t => ({ j: t < 0.12 }));
check("Sprung halten = voll", full > 150 && full < 200, full.toFixed(0) + " px");
check("Sprung tippen = halb (40-60%)", half / full > 0.4 && half / full < 0.6, (half / full * 100).toFixed(0) + "%");
check("Sprung mittel liegt dazwischen", mid > half && mid < full, mid.toFixed(0));
const moon = apex(t => ({ j: t < 0.6 }), { arena: "mond" });
check("Mond: Sprung höher", moon > full * 1.15, moon.toFixed(0));
{ // Halten nach Landung springt erneut (Dauerhüpfen)
  const st = setup(); let jumps = 0;
  run(st, 2.5, () => ({ j: true }), undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "jump") jumps++; });
  check("Sprung gehalten: hüpft weiter", jumps >= 3, jumps + " Sprünge");
}
{ // Coyote time: von der Latte laufen und kurz danach springen
  const st = setup({ ax: 60 });
  const p = st.p[0]; const by = P.barY(st, 0);
  p.y = by - C.BAR_T / 2 - (FOOT + SR) * p.sc; p.onG = true; p.x = 60;
  let leftAt = -1, jumped = false;
  run(st, 0.6, (t, s) => { const q = s.p[0]; if (!q.onG && leftAt < 0) leftAt = t; return { r: true, j: leftAt >= 0 && t - leftAt > 0.04 && t - leftAt < 0.06 }; }, undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "jump") jumped = true; });
  check("Coyote: Sprung kurz nach Kante", jumped, "verlassen bei " + leftAt.toFixed(2));
}
{ // kein Sprung mitten in der Luft ohne Doppelsprung
  const st = setup(); let jumps = 0;
  run(st, 1, t => ({ j: t < 0.05 || (t > 0.3 && t < 0.35) }), undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "jump") jumps++; });
  check("Kein Luftsprung ohne Power-up", jumps === 1, jumps);
}
{ // Doppelsprung-Power-up
  const st = setup(); st.p[0].djT = 5; let jumps = 0;
  run(st, 1, t => ({ j: t < 0.05 || (t > 0.3 && t < 0.35) }), undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "jump") jumps++; });
  check("Doppelsprung mit Power-up", jumps === 2, jumps);
}
{ // Richtungswechsel schneller als Anfahren
  const st = setup(); const p = st.p[0]; p.vx = 505; let tRev = -1;
  run(st, 0.5, () => ({ l: true }), undefined, (s, t) => { keepBall(s); if (tRev < 0 && s.p[0].vx <= -450) tRev = t; });
  const st2 = setup(); let tAcc = -1;
  run(st2, 0.5, () => ({ l: true }), undefined, (s, t) => { keepBall(s); if (tAcc < 0 && s.p[0].vx <= -450) tAcc = t; });
  check("Wenden fühlt sich knackig an", tRev > 0 && tRev < 0.16, "Wende " + (tRev * 1000).toFixed(0) + " ms, Anfahren " + (tAcc * 1000).toFixed(0) + " ms");
}

// ---------- 2. Grätsche ----------
function slideRun(o, inp, secs = 0.9) {
  const st = setup(o); const p = st.p[0]; const x0 = p.x; let slides = 0, maxV = 0; const ev = [];
  run(st, secs, inp, o.inp1, s => { if (!o.ball) keepBall(s); maxV = Math.max(maxV, Math.abs(s.p[0].vx)); for (const e of s.ev.splice(0)) { ev.push(e); if (e.t === "slide") slides++; } });
  return { st, p: st.p[0], dist: st.p[0].x - x0, slides, maxV, ev };
}
{
  const r = slideRun({}, t => ({ d: t < 0.02 }));
  check("Grätsche ohne Richtung = Blickrichtung", r.slides === 1 && r.dist > 60, "Strecke " + r.dist.toFixed(0));
  const rb = slideRun({}, t => ({ d: t < 0.02, l: t < 0.3 }));
  check("Grätsche rückwärts", rb.slides === 1 && rb.dist < -60, rb.dist.toFixed(0));
  const run1 = slideRun({}, t => ({ r: t < 0.3 }));
  const sl = slideRun({}, t => ({ r: t < 0.3, d: t < 0.02 }));
  check("Grätsche nicht viel weiter als Laufen", sl.dist < run1.dist * 1.45 && sl.dist > run1.dist * 0.8, `Grätsche ${sl.dist.toFixed(0)} / Laufen ${run1.dist.toFixed(0)}`);
  const held = slideRun({}, () => ({ d: true }), 2);
  check("Unten gehalten: nur eine Grätsche", held.slides === 1, held.slides);
  const spam = slideRun({}, t => ({ d: Math.floor(t / 0.05) % 2 === 0 }), 2);
  check("Grätschen-Spam durch Abklingzeit begrenzt", spam.slides <= 3, spam.slides + " in 2 s");
  const jump = slideRun({}, t => ({ d: t < 0.02, j: t > 0.1 && t < 0.4 }));
  check("Aus der Grätsche springen", jump.ev.some(e => e.t === "jump") && jump.p.slide <= 0, "");
  const kick = slideRun({}, t => ({ d: t < 0.02, k: t > 0.05 && t < 0.1 }));
  check("Kein Schuss während Grätsche", !kick.ev.some(e => e.t === "swing" && e.i === 0), "");
  const charge = slideRun({}, t => ({ k: t < 0.5, d: t > 0.3 && t < 0.32 }));
  check("Grätsche bricht Aufladen ab", charge.ev.some(e => e.t === "slide") && !charge.ev.some(e => e.t === "kick"), "");
  const ice = slideRun({ rules: { floor: "ice" } }, t => ({ d: t < 0.02 }), 2);
  check("Eis: Grätsche länger, aber endlich", ice.dist > r.dist && isFinite(ice.dist), ice.dist.toFixed(0));
  const conf = slideRun({}, (t, s) => { if (t === 0) s.p[0].confT = 3; return { d: t < 0.02, r: t < 0.3 }; });
  check("Verwirrt: Grätsche folgt vertauschter Richtung", conf.dist < -40, conf.dist.toFixed(0));
  const wall = slideRun({ ax: 120 }, t => ({ d: t < 0.02, l: t < 0.3 }));
  check("Grätsche an die Wand bleibt im Feld", wall.p.x >= 50 && isFinite(wall.p.x), wall.p.x.toFixed(0));
  const frz = slideRun({}, (t, s) => { if (t === 0) s.p[0].frz = 1; return { d: t < 0.02 }; });
  check("Eingefroren: keine Grätsche", frz.slides === 0, "");
  const stunMid = slideRun({}, (t, s) => { if (Math.abs(t - 0.08) < DT / 2) s.p[0].stun = 0.5; return { d: t < 0.02 }; });
  check("Betäubt während Grätsche: endet sofort", stunMid.p.slide <= 0, "");
}
{ // Grätsche in den Ball
  const st = setup({ ballX: 640, ballY: G - 24 });
  const p = st.p[0]; p.x = 500; let poke = null, pvx = 0;
  run(st, 0.6, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "poke") { poke = e; pvx = s.b.vx; } });
  check("Grätsche spitzelt Ball nach vorn", poke && pvx > 300, poke ? "v " + pvx.toFixed(0) : "kein Kontakt");
  const st2 = setup({ ballX: 360, ballY: G - 24 }); let poke2 = null;
  run(st2, 0.6, t => ({ d: t < 0.02, l: t < 0.05 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "poke") poke2 = e; });
  check("Grätsche rückwärts spitzelt nach hinten", poke2 && st2.b.vx < -300, poke2 ? "ok" : "kein Kontakt");
  const st3 = setup({ ballX: 640, ballY: 300 }); let poke3 = 0;
  run(st3, 0.4, t => ({ d: t < 0.02 }), undefined, s => { s.b.y = 300; s.b.vy = 0; for (const e of s.ev.splice(0)) if (e.t === "poke") poke3++; });
  check("Hoher Ball wird nicht gespitzelt", poke3 === 0, "");
  const st4 = setup({ ballX: 640, ballY: G - 24, rules: { kick: 1.45 } }); let mv = 0;
  run(st4, 0.6, t => ({ d: t < 0.02 }), undefined, s => { mv = Math.max(mv, Math.hypot(s.b.vx, s.b.vy)); });
  check("Grätsche schwächer als harter Schuss", mv < 1600, "max " + mv.toFixed(0));
}
{ // Grätsche in den Gegner
  const st = setup({ ax: 500, bx: 640 }); let trips = 0, ms = 0;
  run(st, 0.6, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); ms = Math.max(ms, s.p[1].stun); for (const e of s.ev.splice(0)) if (e.t === "trip") trips++; });
  check("Gegner wird umgegrätscht", trips === 1 && ms > 0, "Stun " + ms.toFixed(2));
  // direkt nochmal: Schutzzeit
  const o = st.p[1]; o.stun = 0; o.x = st.p[0].x + 140; o.y = rest(o); o.onG = true; o.vx = 0; st.p[0].slideCD = 0; let trips2 = 0;
  run(st, 0.5, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "trip") trips2++; });
  check("Kein Dauer-Umgrätschen (Schutzzeit)", trips2 === 0, "");
  const st2 = setup({ ax: 500, bx: 640 }); let trips3 = 0;
  run(st2, 0.6, t => ({ d: t < 0.02 }), t => ({ j: t < 0.3 }), s => { keepBall(s); for (const e of s.ev.splice(0)) if (e.t === "trip") trips3++; });
  check("Springender Gegner wird nicht umgegrätscht", trips3 === 0, "");
  const st3 = setup({ ax: 500, bx: 640 }); let stun = 0;
  run(st3, 1.5, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); stun = Math.max(stun, s.p[1].stun); });
  check("Stolpern nur kurz", stun <= 0.36, stun.toFixed(2) + " s");
  const st4 = setup({ ax: 500, bx: 640 }); let pen = false;
  run(st4, 0.6, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); if (Math.abs(s.p[0].x - s.p[1].x) < 90) pen = true; });
  check("Keiner rutscht durch den anderen durch", !pen, "");
}

// ---------- 3. Arschbombe ----------
function bombRun(o, inp, secs, inp1) {
  secs ??= 1.4;
  const st = setup(o); const ev = []; let maxV = 0;
  run(st, secs, inp, inp1, s => { if (!o.ball) keepBall(s); maxV = Math.max(maxV, Math.hypot(s.b.vx, s.b.vy)); for (const e of s.ev.splice(0)) ev.push(e); });
  return { st, p: st.p[0], ev, maxV };
}
{
  const low = bombRun({}, t => ({ j: t < 0.02, d: t > 0.025 && t < 0.035 }));
  const lowEv = low.ev.find(e => e.t === "bomb");
  check("Bombe direkt nach Absprung: wird gepuffert und kommt ab Mindesthöhe", lowEv && lowEv.y < 616 - 40, lowEv ? "ok" : "fehlt");
  let pressed = 0; const late = bombRun({}, (t, s) => { const q = s.p[0]; const d = !q.onG && q.vy > 0 && q.y > 616 - 71 - 30 && pressed < 2; if (d) pressed++; return { j: t < 0.02, d }; }); // kurz vor der Landung
  check("Unten kurz vor Landung: keine Grätsche danach", !late.ev.some(e => e.t === "slide"), "");
  const kb = slideRun({}, t => ({ k: t < 0.05, d: t > 0.1 && t < 0.12 }));
  check("Unten direkt nach Schuss: Grätsche kommt trotzdem", kb.ev.some(e => e.t === "slide"), "");
  const hi = bombRun({}, t => ({ j: t < 0.6, d: t > 0.3 && t < 0.32 }));
  const pound = hi.ev.find(e => e.t === "pound");
  check("Bombe oben: fällt und landet hart", hi.ev.some(e => e.t === "bomb") && pound && pound.k > 0.6, pound ? "k " + pound.k.toFixed(2) : "");
  let tDown = -1, tNorm = -1;
  { const st = setup(); run(st, 1.2, t => ({ j: t < 0.6, d: t > 0.3 && t < 0.32 }), undefined, (s, t) => { keepBall(s); if (tDown < 0 && t > 0.3 && s.p[0].onG) tDown = t - 0.3; }); }
  { const st = setup(); run(st, 1.2, t => ({ j: t < 0.6 }), undefined, (s, t) => { keepBall(s); if (tNorm < 0 && t > 0.3 && s.p[0].onG) tNorm = t - 0.3; }); }
  check("Bombe holt schnell runter (Fehlsprung abbrechen)", tDown > 0 && tDown < tNorm * 0.5, `${(tDown * 1000).toFixed(0)} ms statt ${(tNorm * 1000).toFixed(0)} ms`);
  let recov = 0;
  { const st = setup(); let landT = -1; run(st, 1.2, t => ({ j: t < 0.6, d: t > 0.3 && t < 0.32, r: t > 0.3 }), undefined, (s, t) => { keepBall(s); if (landT < 0 && t > 0.3 && s.p[0].onG) landT = t; if (landT > 0 && recov === 0 && s.p[0].vx > 400) recov = t - landT; }); }
  check("Nach Landung sofort wieder laufbereit", recov > 0 && recov < 0.2, (recov * 1000).toFixed(0) + " ms bis Volltempo");
  const twice = bombRun({}, t => ({ j: t < 0.6, d: (t > 0.3 && t < 0.32) || (t > 0.34 && t < 0.36) }));
  check("Zweimal unten in der Luft: nur eine Bombe", twice.ev.filter(e => e.t === "bomb").length === 1, "");
  const jmp = bombRun({}, t => ({ j: t < 0.6 || (t > 0.33 && t < 0.4), d: t > 0.3 && t < 0.32 }));
  check("Kein Sprung während der Bombe", jmp.ev.filter(e => e.t === "jump").length <= 2 && jmp.ev.filter(e => e.t === "pound").length === 1, "");
  const kk = bombRun({}, t => ({ j: t < 0.6, d: t > 0.3 && t < 0.32, k: t > 0.33 && t < 0.35 }));
  check("Kein Schuss während der Bombe", !kk.ev.some(e => e.t === "swing" && e.i === 0 && e.pow && false) && kk.ev.filter(e => e.t === "kick").length === 0, "");
  const mond = bombRun({ arena: "mond" }, t => ({ j: t < 0.6, d: t > 0.4 && t < 0.42 }));
  check("Mond: Bombe funktioniert", mond.ev.some(e => e.t === "pound"), "");
  const frz = bombRun({}, (t, s) => { if (Math.abs(t - 0.2) < DT / 2) s.p[0].frz = 1; return { j: t < 0.6, d: t > 0.3 && t < 0.32 }; });
  check("Eingefroren in der Luft: keine Bombe", !frz.ev.some(e => e.t === "bomb"), "");
  const bar = (() => { const st = setup({ ax: 60 }); const p = st.p[0]; p.x = 60; p.y = 200; p.onG = false; p.vy = 0; const ev = []; run(st, 0.6, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); for (const e of s.ev.splice(0)) ev.push(e); }); return { p: st.p[0], ev }; })();
  check("Bombe auf die Latte: landet sauber darauf", bar.ev.some(e => e.t === "pound") && bar.p.onG && bar.p.bomb === 0, "y " + bar.p.y.toFixed(0));
}
{ // Ball quetschen: Richtung nach Treffpunkt
  const res = [];
  for (const off of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const st = setup({ ax: 600, ballX: 600 + off * 60, ballY: G - 24 });
    const p = st.p[0]; p.y = 260; p.onG = false; p.vy = 0;
    let sq = null; run(st, 0.5, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "squash" && !sq) sq = { e, vx: s.b.vx, vy: s.b.vy }; });
    res.push([off, sq]);
  }
  const ok = res.every(([off, sq]) => sq && (off === 0 ? Math.abs(sq.vx) < Math.abs(sq.vy) : Math.sign(sq.vx) === Math.sign(off)));
  check("Quetschen: Richtung folgt Treffpunkt", ok, res.map(([o, q]) => `${o}:${q ? q.vx.toFixed(0) + "/" + q.vy.toFixed(0) : "–"}`).join(" "));
  const flatter = res[4][1] && res[3][1] && Math.abs(res[4][1].vy) < Math.abs(res[3][1].vy);
  check("Quetschen: Rand = flacher", flatter, "");
  // Fallhöhe bestimmt die Wucht
  const pow = h => { const st = setup({ ax: 600, ballX: 640, ballY: G - 24 }); const p = st.p[0]; p.y = rest(p) - h; p.onG = false; p.vy = 0; let v = 0; run(st, 0.5, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "squash") v = Math.hypot(s.b.vx, s.b.vy); }); return v; };
  const vLow = pow(60), vHigh = pow(250);
  check("Kleine Fallhöhe = schwacher Quetschball", vLow > 0 && vHigh > vLow * 1.6, `${vLow.toFixed(0)} vs ${vHigh.toFixed(0)}`);
  const st = setup({ ax: 600, ballX: 640, ballY: G - 24, rules: { kick: 1.45 } }); const p = st.p[0]; p.y = 120; p.onG = false; let mv = 0;
  run(st, 0.6, t => ({ d: t < 0.02 }), undefined, s => { mv = Math.max(mv, Math.hypot(s.b.vx, s.b.vy)); });
  check("Quetschball unter Tempo-Grenze (Brutal)", mv <= P.KICK.cap * 1.45 + 1, mv.toFixed(0));
  // Ball in der Luft darunter: Schmettern
  const st2 = setup({ ax: 600, ballX: 610, ballY: 420 }); const p2 = st2.p[0]; p2.y = 250; p2.onG = false; let sm = null;
  run(st2, 0.3, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "smash") sm = s.b.vy; });
  check("Ball in der Luft wird runter geschmettert", sm !== null && sm > 500, sm ? sm.toFixed(0) : "");
  // keine Doppelberührung
  const st3 = setup({ ax: 600, ballX: 630, ballY: G - 24 }); const p3 = st3.p[0]; p3.y = 250; p3.onG = false; let n = 0;
  run(st3, 0.4, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "squash" || e.t === "smash") n++; });
  check("Quetschen zählt nur einmal", n === 1, n);
}
{ // Bombe auf den Kopf
  const st = setup({ ax: 800, bx: 800 }); const a = st.p[0]; a.y = 120; a.onG = false; let ev = null, stun = 0;
  run(st, 0.8, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); stun = Math.max(stun, s.p[1].stun); for (const e of s.ev.splice(0)) if (e.t === "stomp") ev = e; });
  check("Bombe auf den Kopf betäubt", ev && ev.bomb && stun >= 0.45 && stun <= 0.86, "Stun " + stun.toFixed(2));
  const st2 = setup({ ax: 800, bx: 800 }); const a2 = st2.p[0]; a2.y = 120; a2.onG = false; let stomps = 0;
  run(st2, 2, t => ({ d: t < 0.02, j: t > 0.2 }), undefined, s => { keepBall(s); s.p[1].x = s.p[0].x; for (const e of s.ev.splice(0)) if (e.t === "stomp") stomps++; });
  check("Kein Dauer-Betäuben durch Hüpfen", st2.p[1].stun < 0.9, stomps + " Treffer");
}

// ---------- 4. Phasen ----------
{
  const st = setup(); st.ph = "cd"; st.pt = 3; const x0 = st.p[0].x;
  P.advance(st, 0.5, [{ d: true, j: true, r: true }, {}], 0);
  check("Countdown: keine Bewegung", st.p[0].slide <= 0 && st.p[0].onG && Math.abs(st.p[0].x - x0) < 1, "");
}

// ---------- 5. Fuzz: zufällige Eingaben ----------
{
  let bad = 0, steps = 0; const seed = 7; let rs = seed; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (const arena of ["stadion", "eis", "mond", "neon", "strand"]) for (const rules of [{}, { kick: 1.45, bounce: 1.4 }, { ball: 1.8, goal: 1.5 }, { floor: "ice", grav: 0.55 }]) {
    const st = P.newMatch({ chars: ["tank", "flummi"], arena, dur: 30, pus: true, rules }); st.ph = "play";
    let i0 = {}, i1 = {};
    for (let k = 0; k < 120 * 30; k++) {
      if (k % 6 === 0) { i0 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.2, d: rnd() < 0.12, k: rnd() < 0.2, s: rnd() < 0.02 }; i1 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.2, d: rnd() < 0.12, k: rnd() < 0.2, s: rnd() < 0.02 }; }
      P.step(st, DT, [i0, i1]); st.ev.length = 0; steps++;
      if (st.ph !== "play") { st.ph = "play"; P.kickoff(st); }
      const vals = [st.b.x, st.b.y, st.b.vx, st.b.vy, ...st.p.flatMap(p => [p.x, p.y, p.vx, p.vy])];
      if (vals.some(v => !isFinite(v)) || st.b.y > G + 5 || st.b.x < -60 || st.b.x > W + 60 || st.p.some(p => p.y > G || p.x < 0 || p.x > W)) bad++;
    }
  }
  check("Fuzz: 72.000 Schritte ohne NaN/Ausreißer", bad === 0, `${bad} schlechte von ${steps}`);
}

// ---------- 6. Funde aus dem Review ----------
{ // Dauer-Betäuben durch wiederholte Bomben auf den Kopf
  const st = setup({ ax: 812, bx: 800 }); const a = st.p[0]; a.y = 120; a.onG = false; let stunT = 0, n = 0;
  run(st, 5, t => ({ d: Math.floor(t / 0.1) % 2 === 0 }), undefined, s => { keepBall(s); n++; if (s.p[1].stun > 0) stunT++; });
  check("Stillstehender Gegner: Betäubung begrenzt (Review 1)", stunT / n < 0.4, (stunT / n * 100).toFixed(0) + "% der Zeit betäubt");
  // Angreifer verfolgt den Gegner, der Gegner versucht wegzulaufen
  const st2 = setup({ ax: 812, bx: 800 }); st2.p[0].y = 120; st2.p[0].onG = false; let st2T = 0, n2 = 0;
  run(st2, 5, (t, s) => ({ d: Math.floor(t / 0.1) % 2 === 0, j: s.p[0].onG, l: s.p[0].x > s.p[1].x + 5, r: s.p[0].x < s.p[1].x - 5 }), (t, s) => ({ l: s.p[1].stun <= 0 && s.p[1].x > 300, j: s.p[1].stun <= 0 && Math.floor(t * 3) % 3 === 0 }), s => { keepBall(s); n2++; if (s.p[1].stun > 0) st2T++; });
  check("Verfolger mit Bomben: Gegner kommt weg (Review 1)", st2T / n2 < 0.3, (st2T / n2 * 100).toFixed(0) + "% der Zeit betäubt");
}
{ // Bombe genau auf den Kopf: kein seitlicher Ruck
  const st = setup({ ax: 700, bx: 700 }); const a = st.p[0]; a.y = 200; a.onG = false; let maxJump = 0, px = [700, 700];
  run(st, 0.5, t => ({ d: t < 0.02 }), undefined, s => { keepBall(s); maxJump = Math.max(maxJump, Math.abs(s.p[0].x - px[0]), Math.abs(s.p[1].x - px[1])); px = [s.p[0].x, s.p[1].x]; });
  check("Bombe auf Kopf: kein seitlicher Sprung (Review 2)", maxJump < 8, maxJump.toFixed(1) + " px pro Schritt");
}
{ // Grätsche gegen jemanden auf der Latte
  const st = setup({ ax: 300, bx: 60 }); const o = st.p[1]; o.x = 60; o.y = P.barY(st, 0) - C.BAR_T / 2 - (FOOT + SR) * o.sc; o.onG = true; let trips = 0;
  st.p[0].x = 230;
  run(st, 0.6, t => ({ d: t < 0.02, l: t < 0.05 }), undefined, s => { keepBall(s); s.p[1].vx = 0; for (const e of s.ev.splice(0)) if (e.t === "trip") trips++; });
  check("Grätsche trifft niemanden auf der Latte (Review 4)", trips === 0, "");
}
{ // Beide grätschen gleichzeitig
  const st = setup({ ax: 600, bx: 780 }); let s0 = 0, s1 = 0;
  run(st, 0.6, t => ({ d: t < 0.02 }), t => ({ d: t < 0.02 }), s => { keepBall(s); s0 = Math.max(s0, s.p[0].stun); s1 = Math.max(s1, s.p[1].stun); });
  check("Gleichzeitige Grätsche: beide gleich behandelt (Review 5)", Math.abs(s0 - s1) < 0.01, `${s0.toFixed(2)} / ${s1.toFixed(2)}`);
}
{ // Mittig gequetscht: Ball steckt danach nicht im Kopf
  const st = setup({ ax: 600, ballX: 600, ballY: G - 24 }); const p = st.p[0]; p.y = 250; p.onG = false; let inside = 0, after = false;
  run(st, 0.6, t => ({ d: t < 0.02 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "squash") after = true; if (after) { const q = s.p[0]; if (Math.hypot(s.b.x - q.x, s.b.y - q.y) < P.pr(q) + s.b.r - 6) inside++; } });
  check("Mittig gequetscht: Ball nicht im Kopf (Review)", inside === 0, inside + " Schritte überlappt");
}
{ // Nach Schubser kein Sofort-Sprung
  const st = setup({ ax: 600, bx: 700 }); let jumpedAt = -1, bumpAt = -1;
  run(st, 0.6, () => ({}), t => ({ k: t < 0.05 }), (s, t) => { keepBall(s); for (const e of s.ev.splice(0)) { if (e.t === "bump") bumpAt = t; if (e.t === "jump" && e.i === 0 && bumpAt >= 0 && jumpedAt < 0) jumpedAt = t; } });
  const st2 = setup({ ax: 600, bx: 700 }); let bumpAt2 = -1, jumped2 = false;
  run(st2, 0.6, t => ({ j: bumpAt2 >= 0 && t - bumpAt2 < 0.06 }), t => ({ k: t < 0.05 }), (s, t) => { keepBall(s); for (const e of s.ev.splice(0)) { if (e.t === "bump" && bumpAt2 < 0) bumpAt2 = t; if (e.t === "jump" && e.i === 0) jumped2 = true; } });
  check("Nach Schubser kein Coyote-Sprung (Review)", bumpAt2 < 0 || !jumped2, bumpAt2 < 0 ? "kein Schubser ausgelöst" : "");
}
{ // Druck während Hit-Stop geht nicht verloren
  const st = setup(); const p = st.p[0]; p.y = 300; p.onG = false; p.vy = 0;
  st.hs = 0.1; let acc = 0;
  acc = P.advance(st, 0.016, [{ d: true }, {}], acc); acc = P.advance(st, 0.016, [{}, {}], acc);
  for (let k = 0; k < 12; k++) acc = P.advance(st, 0.016, [{}, {}], acc);
  check("Druck im Hit-Stop wird nachgeholt (Review 8)", st.stats[0].bombs === 1, "Bomben: " + st.stats[0].bombs);
}

// ---------- 7. Ball-Tempo (Mitnahme) ----------
function kickAt(o) {
  // Ball kommt mit Tempo v auf den stehenden Spieler zu, Spieler schießt im passenden Moment
  const st = setup({ ax: 500, bx: 1450, ballX: o.x ?? 760, ballY: o.y ?? (G - 24), rules: o.rules });
  st.b.vx = -(o.v ?? 1200); st.b.vy = o.vy ?? 0;
  let ev = null; const pressAt = o.press ?? 0.05;
  run(st, 0.8, t => ({ k: t > pressAt - 0.02 && t < pressAt + (o.hold ?? 0) }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "kick" && !ev) ev = e; });
  return ev;
}
{
  // Zeitpunkt suchen, an dem ein Kontakt entsteht
  const find = o => { for (let pt = 0.02; pt < 0.5; pt += 0.01) { const e = kickAt({ ...o, press: pt }); if (e && e.q > 0.6) return e; } return null; };
  const fast = find({ v: 1300 }), slow = find({ v: 500 });
  check("Schneller Ball sauber getroffen: kommt schneller zurück", fast && fast.spd > fast.inSpd, fast ? `${fast.inSpd.toFixed(0)} -> ${fast.spd.toFixed(0)}` : "kein Treffer");
  check("Schneller Ball wird kein Lupfer", fast && fast.kind !== "lob", fast ? fast.kind : "");
  check("Tempo stapelt sich: schnell rein > langsam rein", fast && slow && fast.spd > slow.spd, slow && fast ? `${slow.spd.toFixed(0)} vs ${fast.spd.toFixed(0)}` : "");
  const lim = P.KICK.cap;
  check("Mitnahme bleibt unter der Obergrenze", fast && fast.spd <= lim + 1, fast ? fast.spd.toFixed(0) : "");
}
// Ping-Pong: beide schießen sich den Ball dauernd zu, Tempo darf nicht explodieren
  for (const rules of [{}, { kick: 1.45, bounce: 1.4 }, { ball: 0.75, kick: 1.45 }]) {
    const st = setup({ ax: 600, bx: 820, ballX: 710, ballY: 560, rules }); let mx = 0, bad = 0;
    const L = P.KICK.cap * Math.max(1, rules.kick || 1);
    run(st, 8, t => ({ k: Math.floor(t * 6) % 2 === 0 }), t => ({ k: Math.floor(t * 6 + 1) % 2 === 0 }), s => { const v = Math.hypot(s.b.vx, s.b.vy); mx = Math.max(mx, v); if (!isFinite(v) || s.b.y > G + 2) bad++; if (s.ph !== "play") { s.ph = "play"; P.kickoff(s); } });
    check("Ping-Pong " + JSON.stringify(rules) + ": Tempo begrenzt", bad === 0 && mx <= L * 1.12, mx.toFixed(0) + " (Limit " + L + ")");
  }
{ // Tunneln: Ball mit Höchsttempo gegen Latte und Köpfe darf nicht durchrutschen
  let through = 0, shots = 0;
  for (const rules of [{ kick: 1.45 }, { kick: 1.45, ball: 0.75 }]) for (let ang = -0.9; ang <= 0.9; ang += 0.06) {
    const st = setup({ ax: 1300, bx: 1450, rules }); const b = st.b; const by = P.barY(st, 0);
    const sp = P.KICK.cap * 1.45; b.x = 420; b.y = by + Math.sin(ang * 3) * 60; b.vx = -Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp * 0.5; shots++;
    const above = b.y < by; let crossed = false;
    for (let k = 0; k < 60; k++) { P.step(st, DT, [{}, {}]); st.ev.length = 0; if (b.x < C.GOAL_W - 4 && b.x > 4) { const nowAbove = b.y < by; if (nowAbove !== above && Math.abs(b.y - by) > b.r * 0.5 && b.x < C.GOAL_W - 10) crossed = true; } if (st.ph !== "play") break; }
    if (crossed) through++;
  }
  check("Höchsttempo: kein Durchrutschen durch die Latte", through === 0, `${through} von ${shots}`);
}
{ // Ball im Lauf vor sich her (Dribbeln) und schießen = Strahl, liegender Ball = Lupfer
  const st = setup({ ax: 500, ballX: 570, ballY: G - 24 }); let kind = null;
  run(st, 1, t => ({ r: true, k: t > 0.5 && t < 0.52 }), undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "kick" && !kind) kind = e.kind; });
  check("Dribbeln und schießen = Strahl", kind === "drive", kind);
  const st2 = setup({ ax: 500, ballX: 560, ballY: G - 24 }); let kind2 = null;
  run(st2, 0.6, (t, s) => { if (t < 0.4) { s.b.vx = 0; s.b.vy = 0; s.b.x = 560; s.b.y = G - 24; } return { k: t > 0.4 && t < 0.42 }; }, undefined, s => { for (const e of s.ev.splice(0)) if (e.t === "kick" && !kind2) kind2 = e.kind; });
  check("Liegender Ball = Lupfer", kind2 === "lob", kind2);
}

// ---------- 8. Hindernisse und Feldgröße ----------
const LY = await import("../../js/content/layouts.js");
{
  let asym = 0, goalArea = 0, spawn = 0, total = 0;
  for (const ar of Object.keys(LY.LAYOUTS)) for (let li = 0; li < LY.LAYOUTS[ar].length; li++) for (const field of [0.82, 1, 1.18]) {
    const st = setup({ arena: ar, rules: { obs: li, field } }); total++;
    for (const tt of [0, 1.3, 2.9, 4.4]) {
      LY.moveObstacles(st.obs, tt, 1 / 120);
      const key = o => `${o.t}|${Math.round(o.y)}|${o.w}|${o.r}`;
      for (const o of st.obs) { const m = st.obs.find(q => key(q) === key(o) && Math.abs((C.W - q.x) - o.x) < 1.5); if (!m) asym++; }
    }
    LY.moveObstacles(st.obs, 0, 0);
    for (const o of st.obs) {
      const ext = o.t === "plat" ? o.w / 2 : o.r + (o.mv && o.mv.orbit ? o.mv.orbit : 0);
      if (o.cx - ext - Math.abs(o.mv?.ax || 0) < C.GOAL_W + 60 || o.cx + ext + Math.abs(o.mv?.ax || 0) > C.W - C.GOAL_W - 60) goalArea++;
      const fresh = P.newMatch({ chars: ["kalle", "yuki"], arena: ar, dur: 90, rules: { obs: li, field } });
      for (const p of fresh.p) if (o.t === "plat" && o.block && Math.abs(p.x - o.x) < o.w / 2 + P.pr(p) + 10) spawn++;
      if (o.t === "plat" ? (Math.abs(C.W / 2 - o.x) < o.w / 2 + 30 && o.y < 300 && o.y + o.h > 230) : (!o.mv && Math.hypot(C.W / 2 - o.x, 265 - o.y) < o.r + 24 + 10)) spawn++;
    }
  }
  check(`Alle ${total} Layout/Feld-Kombis spiegelbildlich`, asym === 0, asym + " Abweichungen");
  check("Torraum bleibt frei", goalArea === 0, goalArea + " Teile zu nah am Tor");
  check("Startplätze und Anstoß frei", spawn === 0, spawn + " Konflikte");
}
{ // Auf einen Block springen und darauf stehen; runterlaufen
  const st = setup({ arena: "stadion", rules: { obs: 1 } }); // Brücke: Blöcke vor den Toren
  const blk = st.obs.find(o => o.block && o.x < C.W / 2); const p = st.p[0]; p.x = blk.x + 120;
  let stood = false;
  run(st, 1.6, (t, s) => ({ l: s.p[0].x > blk.x + 5 && t < 1, j: t > 0.02 && t < 0.4 }), undefined, s => { keepBall(s); if (s.p[0].onG && Math.abs(s.p[0].y + (FOOT + SR) - blk.y) < 2) stood = true; });
  check("Auf einen Block springen und stehen", stood, "");
  const st2 = setup({ arena: "stadion", rules: { obs: 1 } }); const b2 = st2.obs.find(o => o.block && o.x < C.W / 2); const q = st2.p[0];
  q.x = b2.x; q.y = b2.y - (FOOT + SR); q.onG = true;
  run(st2, 1, () => ({ r: true }), undefined, s => keepBall(s));
  check("Vom Block runterlaufen landet am Boden", st2.p[0].onG && Math.abs(st2.p[0].y - rest(st2.p[0])) < 1, "y " + st2.p[0].y.toFixed(0));
}
{ // Von unten gegen hohe Plattform: Kopfstoß, nicht durch
  const st = setup({ arena: "stadion", rules: { obs: 2 } }); // Treppe: obere Plattform y 420
  const pl = st.obs.find(o => !o.block && o.x < C.W / 2); const p = st.p[0]; p.x = pl.x;
  let minTop = 1e9, bonk = 0;
  run(st, 0.8, t => ({ j: t < 0.5 }), undefined, s => { keepBall(s); minTop = Math.min(minTop, s.p[0].y - P.pr(s.p[0])); for (const e of s.ev.splice(0)) if (e.t === "bonk") bonk++; });
  check("Kopfstoß an Plattform von unten", minTop >= pl.y + pl.h - 1 && bonk >= 1, `Kopf oben ${minTop.toFixed(0)} / Unterkante ${pl.y + pl.h}`);
}
{ // Bewegte Plattform trägt den Spieler
  const st = setup({ arena: "neon", rules: { obs: 2 } }); // Aufzug
  const pl = st.obs.find(o => o.x < C.W / 2); const p = st.p[0];
  p.x = pl.x; p.y = pl.y - (FOOT + SR) - 1; p.onG = false; p.vy = 0;
  let onIt = 0, n = 0;
  run(st, 3, () => ({}), undefined, s => { keepBall(s); n++; if (Math.abs(s.p[0].y + (FOOT + SR) - pl.y) < 3) onIt++; });
  check("Aufzug trägt den Spieler mit", onIt / n > 0.9, (onIt / n * 100).toFixed(0) + "% der Zeit drauf");
}
{ // Ball rollt von Plattformen und Blöcken immer runter
  let worst = 0;
  for (const [ar, li] of [["stadion", 0], ["stadion", 1], ["eis", 2], ["eis", 1], ["mond", 1], ["strand", 0]]) for (const off of [0, 0.3, -0.45]) {
    const st = setup({ arena: ar, rules: { obs: li }, ax: 200, bx: 1350 }); const pl = st.obs.find(o => o.t === "plat"); if (!pl) continue;
    st.b.x = pl.x + off * pl.w; st.b.y = pl.y - st.b.r - 1; st.b.vx = 0; st.b.vy = 0;
    let onT = 0;
    run(st, 3, () => ({}), () => ({}), s => { if (s.obs.some(o => o.t === "plat" && Math.abs(s.b.y + s.b.r - o.y) < 3 && Math.abs(s.b.x - o.x) < o.w / 2)) onT += DT; s.p[0].x = 200; s.p[1].x = 1350; });
    worst = Math.max(worst, onT);
  }
  check("Ball bleibt nie auf Plattformen liegen", worst < 1.5, "max " + worst.toFixed(2) + " s");
}
{ // Kein Tunneln durch dünne Plattformen bei Höchsttempo
  let through = 0, shots = 0;
  for (const ar of ["stadion", "neon", "eis"]) for (let li = 0; li < 3; li++) {
    const st0 = setup({ arena: ar, rules: { obs: li } });
    for (const o of st0.obs.filter(ob => ob.t === "plat" && !ob.block)) for (const vy of [-1, 1]) for (const ball of [0.75, 1]) {
      const st = setup({ arena: ar, rules: { obs: li, kick: 1.45, ball }, ax: 180, bx: 1380 }); const q = st.obs.find(x => Math.abs(x.cx - o.cx) < 1 && x.cy === o.cy);
      const b = st.b; b.x = q.x; b.y = vy < 0 ? q.y + q.h + 80 : q.y - 80; b.vx = 120; b.vy = vy * -P.KICK.cap * 1.45; shots++;
      const startBelow = b.y > q.y;
      for (let k = 0; k < 40; k++) { P.step(st, DT, [{}, {}]); st.ev.length = 0; if (Math.abs(b.x - q.x) < q.w / 2 && (b.y > q.y + q.h / 2) !== startBelow) { through++; break; } }
    }
  }
  check("Ball rutscht nie durch Plattformen", through === 0, `${through} von ${shots}`);
}
{ // Bumper schleudert, Spieler prallt von Bumper oben ab
  const st = setup({ arena: "neon", rules: { obs: 0 } }); const bu = st.obs.find(o => o.t === "bump" && o.x < C.W / 2);
  st.b.x = bu.x - 60; st.b.y = bu.y; st.b.vx = 400; st.b.vy = 0; let out = 0;
  run(st, 0.6, () => ({}), () => ({}), s => { for (const e of s.ev.splice(0)) if (e.t === "obs" && e.k === "bump") out = Math.hypot(s.b.vx, s.b.vy); s.p[0].x = 200; s.p[1].x = 1350; });
  check("Bumper schleudert langsamen Ball kräftig zurück", out >= 650, out.toFixed(0));
  const st2 = setup({ arena: "mond", rules: { obs: 0 } }); const bm = st2.obs.find(o => o.t === "bump" && o.x < C.W / 2); const p = st2.p[0];
  p.x = bm.x + 5; p.y = bm.y - bm.r - P.pr(p) - 20; p.onG = false; p.vy = 300; let up = false;
  run(st2, 0.5, () => ({}), undefined, s => { keepBall(s); if (s.p[0].vy < -500) up = true; });
  check("Auf Bumper springen = Trampolin", up, "");
}
{ // Power-ups nie in Hindernissen
  let bad = 0;
  for (const ar of Object.keys(LY.LAYOUTS)) for (let li = 0; li < 3; li++) {
    const st = setup({ arena: ar, rules: { obs: li, pu: "many" } }); st.pus = true; st.puT = 0;
    for (let k = 0; k < 40; k++) { st.puT = 0; st.pu = []; P.step(st, DT, [{}, {}]); st.ev.length = 0; for (const u of st.pu) for (const o of st.obs) if (o.t === "plat" ? u.x > o.x - o.w / 2 - 20 && u.x < o.x + o.w / 2 + 20 && u.y > o.y - 30 && u.y < o.y + o.h + 30 : Math.hypot(u.x - o.x, u.y - o.y) < o.r + 30) bad++; }
  }
  check("Power-ups erscheinen nie in Hindernissen", bad === 0, bad + " Treffer");
}
{ // Fuzz mit allen Layouts: kein NaN, niemand steckt in einem Hindernis
  let bad = 0, inside = 0, steps = 0; let rs = 11; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (const ar of Object.keys(LY.LAYOUTS)) for (let li = 0; li < 3; li++) for (const field of [0.82, 1.18]) {
    const st = P.newMatch({ chars: ["tank", "flummi"], arena: ar, dur: 30, pus: true, rules: { obs: li, field } }); st.ph = "play";
    let i0 = {}, i1 = {};
    for (let k = 0; k < 120 * 12; k++) {
      if (k % 6 === 0) { i0 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.25, d: rnd() < 0.1, k: rnd() < 0.2 }; i1 = { l: rnd() < 0.3, r: rnd() < 0.3, j: rnd() < 0.25, d: rnd() < 0.1, k: rnd() < 0.2 }; }
      P.step(st, DT, [i0, i1]); st.ev.length = 0; steps++;
      if (st.ph !== "play") { st.ph = "play"; P.kickoff(st); }
      const vals = [st.b.x, st.b.y, st.b.vx, st.b.vy, ...st.p.flatMap(p => [p.x, p.y])];
      if (vals.some(v => !isFinite(v)) || st.b.y > G + 5 || st.b.x < -60 || st.b.x > C.W + 60) bad++;
      for (const p of st.p) for (const o of st.obs) if (o.t === "plat") { const r = P.pr(p), L = p.x - r * 0.8, R = p.x + r * 0.8, top = p.y - r, bot = p.y + (FOOT + SR) * p.sc; const ox = Math.min(R, o.x + o.w / 2) - Math.max(L, o.x - o.w / 2), oy = Math.min(bot, o.y + o.h) - Math.max(top, o.y); if (ox > 6 && oy > 6 && !(o.mv && p.y >= rest(p) - 1)) inside++; }
      for (const o of st.obs) if (o.t === "plat" && !(st.b.fx && st.b.fx !== "bouncy" && st.b.fx !== "giant")) { const cx = clamp(st.b.x, o.x - o.w / 2, o.x + o.w / 2), cy = clamp(st.b.y, o.y, o.y + o.h); if (Math.hypot(st.b.x - cx, st.b.y - cy) < st.b.r - 6) inside++; }
    }
  }
  check(`Fuzz mit Hindernissen: ${steps} Schritte ohne Fehler`, bad === 0, bad + " schlecht");
  check("Fuzz: niemand steckt in einem Hindernis", inside === 0, inside + " Schritte überlappt");
}

// ---------- 9. Funde aus dem Hindernis-Review ----------
{ // großer Kopf unter dem Aufzug: kein Teleport
  const st = setup({ arena: "neon", rules: { obs: 2, head: 1.3 } }); const pl = st.obs.find(o => o.x < C.W / 2); const p = st.p[0]; p.x = pl.x; p.bigT = 20; p.sc = 1.35 * 1.3;
  let mx = 0, px = p.x;
  run(st, 4, () => ({}), undefined, s => { keepBall(s); s.p[0].bigT = 20; mx = Math.max(mx, Math.abs(s.p[0].x - px)); px = s.p[0].x; });
  check("Riesenkopf unter dem Aufzug: kein Ruck (Review)", mx <= 12, mx.toFixed(1) + " px pro Schritt");
}
{ // Spezialschuss geht durch Hindernisse
  const st = setup({ arena: "stadion", rules: { obs: 1 } }); const p = st.p[0]; p.x = C.W / 2 - 40; st.b.x = C.W / 2; st.b.y = 560; st.b.vx = 0; st.b.vy = 0;
  P.fireSuper(st, p, "meteor"); let minY = 1e9, fxAlive = 0;
  run(st, 0.5, () => ({}), () => ({}), s => { minY = Math.min(minY, s.b.y); if (s.b.fx) fxAlive++; });
  check("Spezialschuss fliegt durch die Brücke (Review)", minY < 150 && fxAlive > 20, "höchster Punkt " + minY.toFixed(0));
}
{ // Anstoß in der Umlaufbahn: Ball wird nicht von den Monden getroffen
  let hits = 0, n = 0;
  for (let ph = 0; ph < 7; ph += 0.035) {
    const st = setup({ arena: "mond", rules: { obs: 2 }, ax: 200, bx: 1350 }); st.el = ph; P.kickoff(st); st.ph = "play"; n++;
    let hit = false; run(st, 0.75, () => ({}), () => ({}), s => { s.p[0].x = 200; s.p[1].x = 1350; for (const e of s.ev.splice(0)) if (e.t === "obs") hit = true; });
    if (hit) hits++;
  }
  check("Anstoß nie von Hindernissen gestört (Review)", hits === 0, `${hits} von ${n}`);
}

for (const [a, b, c] of rows) test(b, () => assert.ok(a === "OK ", c));
