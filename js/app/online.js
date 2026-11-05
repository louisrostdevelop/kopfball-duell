// Online-Spiel: Host schickt Zustände, Gast sagt voraus und gleicht ab; Lobby-Protokoll
import { charById, clamp, EMOTES, HEAD_MAX_LEVEL } from "../content/config.js";
import { moveObstacles } from "../content/layouts.js";
import { emote, matchLen, predictPlayer } from "../core/physics.js";
import { owns, S } from "./profile.js";
import { onEvent } from "./effects.js";
import { beginMatch, headLevel, quitToMenu, resolveObs, startDemo, updateBand } from "./game.js";
import { App, inGame, VERSION } from "./state.js";
import { $, toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { lobbyUI, makeQR, netNote, saveName } from "../ui/screens/online.js";
import { audio as A, input as I, net as Net } from "./services.js";

export function packState(st) {
  const r = v => Math.round(v * 10) / 10;
  const P = p => ({ x: r(p.x), y: r(p.y), vx: r(p.vx), vy: r(p.vy), kick: r(p.kick * 100) / 100, kHeld: p.kHeld, charge: r(p.charge), sc: r(p.sc * 100) / 100, frz: r(p.frz), stun: r(p.stun), meter: Math.round(p.meter), full: p.full, armed: r(p.armed), fireNext: p.fireNext, bigT: r(p.bigT), miniT: r(p.miniT), spdT: r(p.spdT), jmpT: r(p.jmpT), mood: p.mood, emo: p.emo, emoT: r(p.emoT), land: r(p.land), onG: p.onG, confT: r(p.confT), djT: r(p.djT), slide: r(p.slide * 100) / 100, slideDir: p.slideDir, bomb: p.bomb, tripCD: r(p.tripCD) });
  const b = st.b;
  return {
    s: st.s, t: r(st.t), el: Math.round(st.el * 1000) / 1000, ph: st.ph, pt: r(st.pt), gold: st.gold, wall: st.wall.map(r), bigGoal: st.bigGoal.map(r), wind: { t: r(st.wind.t), dir: st.wind.dir },
    pu: st.pu.map(u => ({ id: u.id, k: u.k, x: r(u.x), y: r(u.y), t: r(u.t) })),
    b: { x: r(b.x), y: r(b.y), vx: r(b.vx), vy: r(b.vy), r: r(b.r), a: r(b.a), pw: r(b.pw || 0), fx: b.fx, fxT: r(b.fxT), fxK: b.fxK, fxBX: r(b.fxBX), fxBY: r(b.fxBY), fxDX: r(b.fxDX), fxDY: r(b.fxDY), fxTX: r(b.fxTX || 0), fxTY: r(b.fxTY || 0), alpha: r(b.alpha), fxP: b.fxP },
    p: st.p.map(P), stats: st.stats,
  };
}

export function hostSend(dt) {
  if (!Net.isOpen()) return;
  App.sendT += dt;
  if (App.sendT >= 1 / 30) { App.sendT = 0; Net.send({ t: "s", mid: App.mid, s: packState(App.st), ev: App.outEv.splice(0).filter(e => e.t !== "bounce" || e.v > 400) }); }
}

export function guestFrame(dt, now) {
  const st = App.st;
  const me = I.getInput(1, "single");
  App.gEdge = App.gEdge || { j: 0, d: 0, lj: false, ld: false };
  const ge = App.gEdge; if (me.j && !ge.lj) ge.j++; if (me.d && !ge.ld) ge.d++; ge.lj = !!me.j; ge.ld = !!me.d;
  const iv = [me.l, me.r, me.j, me.k, me.s, me.d].map(v => (v ? 1 : 0)).concat([ge.j % 1000, ge.d % 1000]), key = iv.join(",");
  App.inT += dt;
  if (key !== App.lastIn || App.inT > 0.15) { App.lastIn = key; App.inT = 0; Net.send({ t: "i", i: iv }); }
  App.pingT += dt; if (App.pingT > 2) { App.pingT = 0; Net.send({ t: "ping", c: performance.now() }); }
  const S2 = App.snaps;
  if (!S2.length) return;
  const rt = now - 80;
  while (S2.length > 2 && S2[1].at <= rt) S2.shift();
  const a = S2[0], b = S2[1] || S2[0];
  const k = b === a ? 1 : clamp((rt - a.at) / (b.at - a.at), 0, 1.3);
  applySnap(st, a.s, b.s, k);
  const sp = b.s.p[1];
  if (!App.gp) App.gp = Object.assign({}, st.p[1]);
  const gp = App.gp;
  ["sc", "frz", "stun", "bigT", "miniT", "spdT", "jmpT", "armed", "confT", "djT", "tripCD"].forEach(f => gp[f] = sp[f]);
  if (st.obs && st.obs.length) moveObstacles(st.obs, st.el, dt);
  if (gp.bomb && !sp.bomb && sp.vy < 0) { gp.bomb = 0; gp.bombLock = true; gp.vy = sp.vy; gp.y = sp.y; gp.onG = false; }
  if (gp.slide > 0 && !(sp.slide > 0) && Math.abs(sp.vx) < Math.abs(gp.vx) * 0.7) { gp.slide = 0; gp.slideCD = 0.5; gp.vx = sp.vx; }
  if (sp.stun > 0 && gp.slide > 0) gp.slide = 0;
  predictPlayer(st, gp, me, dt);
  const lat = Math.min(0.25, App.rtt / 2000 + 0.08);
  const tx = sp.x + sp.vx * lat, ty = sp.y + sp.vy * lat * 0.5;
  const ex = tx - gp.x, ey = ty - gp.y;
  if (Math.abs(ex) > 140 || Math.abs(ey) > 160 || st.ph !== "play") { gp.x += ex * 0.35; gp.y += ey * 0.35; }
  else { gp.x += ex * 0.08; gp.y += ey * (gp.onG && sp.onG ? 0.3 : 0.06); }
  Object.assign(st.p[1], { x: gp.x, y: gp.y, kick: Math.max(gp.kick, sp.kick), kHeld: gp.kHeld, charge: gp.charge, onG: gp.onG, slide: gp.slide, slideDir: gp.slideDir, bomb: gp.bomb, vx: gp.vx, vy: gp.vy });
}

export function applySnap(st, a, b, k) {
  const L = (x, y) => x + (y - x) * k;
  if (b.el !== undefined) { const ne = a.el !== undefined && Math.abs(b.el - a.el) < 1 ? L(a.el, b.el) : b.el; if (ne > st.el || ne < st.el - 2) st.el = ne; }
  st.s = b.s; st.t = b.t; st.ph = b.ph; st.pt = b.pt; st.gold = b.gold; st.wall = b.wall; st.bigGoal = b.bigGoal; if (b.wind) st.wind = b.wind; st.pu = b.pu; st.stats = b.stats;
  const jump = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) > 200;
  Object.assign(st.b, b.b);
  if (!jump) { st.b.x = L(a.b.x, b.b.x); st.b.y = L(a.b.y, b.b.y); st.b.a = L(a.b.a, b.b.a); }
  [0, 1].forEach(i => { const pa = a.p[i], pb = b.p[i], p = st.p[i]; Object.assign(p, pb); if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 200) { p.x = L(pa.x, pb.x); p.y = L(pa.y, pb.y); } });
}

export function hostGame() {
  if (!Net.available()) { netNote("Online-Modus konnte nicht geladen werden. Prüf deine Internetverbindung.", true); return; }
  saveName($("nameIn").value);
  App.opp = null;
  App.netCfg = { arena: owns("arenas", S.arena) ? S.arena : "stadion", rules: { ...S.rules } };
  $("lobbyCode").textContent = "····"; $("lobbyLink").textContent = ""; $("qrBox").innerHTML = "";
  lobbyUI("host");
  $("lobbyNote").textContent = "Raum wird geöffnet…";
  showScreen("lobby");
  setTimeout(() => { if (App.screen === "lobby" && $("lobbyCode").textContent === "····") $("lobbyNote").textContent = "Der Online-Server antwortet gerade nicht. Prüf deine Verbindung und versuch es nochmal."; }, 9000);
  Net.host({
    onReady: code => {
      const link = location.origin + location.pathname + "?join=" + code.toUpperCase();
      $("lobbyCode").textContent = code.toUpperCase(); $("lobbyLink").textContent = link;
      $("lobbyNote").textContent = "Schick den Link. Sobald dein Kumpel ihn öffnet, ist er hier.";
      makeQR(link);
    },
    onConn: () => { $("lobbyNote").textContent = "Verbunden. Gleich geht's los…"; },
    onData: hostData,
    onClose: () => {
      App.opp = null;
      if (inGame() || App.screen === "end" || App.screen === "pause") { toast("Gegner hat die Verbindung verloren"); backToLobby(); }
      lobbyUI("host"); $("lobbyNote").textContent = "Gegner ist weg. Schick den Link nochmal.";
    },
    onError: t => { $("lobbyNote").textContent = "Raum konnte nicht geöffnet werden (" + t + "). Versuch es nochmal."; },
  });
}

export function hostData(d) {
  switch (d.t) {
    case "hello":
      if (d.v !== VERSION) toast("Dein Kumpel hat eine alte Version. Er soll die Seite neu laden.", "i-close");
      App.opp = { name: (d.name || "Gast").slice(0, 12), ch: charById(d.ch).id, lv: d.lv };
      Net.send({ t: "welcome", name: S.name || "Gastgeber", ch: S.char, cfg: App.netCfg, v: VERSION });
      lobbyUI("host"); A.sfx("coin"); toast(App.opp.name + " ist da!", "i-users");
      break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; if (d.lv) App.opp.lv = d.lv; lobbyUI("host"); } break;
    case "i": if (Array.isArray(d.i)) App.guestIn = d.i.slice(0, 8); break;
    case "emo": if (App.mode === "host" && App.st && EMOTES.includes(d.e)) emote(App.st, 1, d.e); break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "rematch": toast((App.opp ? App.opp.name : "Gast") + " will Revanche!", "i-swap"); break;
  }
}

export function hostStart() {
  if (!App.opp) return;
  const c = App.netCfg;
  // Kopf-Level: Gegnersuche vom Server (zum Spielbeginn festgehalten), unter Freunden das, was jeder mitbringt
  const sv = App.mm && App.mm.heads, lv = sv && sv.p1 ? [sv.p1.level || 1, (sv.p2 && sv.p2.level) || 1] : [headLevel(S.char), Math.max(1, Math.min(HEAD_MAX_LEVEL, App.opp.lv | 0 || 1))];
  const cfg = { mode: "host", levels: lv, chars: [S.char, App.opp.ch], arena: c.arena, dur: matchLen(c.rules).dur, rules: c.rules, mod: null, golden: true, names: [S.name || "Du", App.opp.name], labels: ["DU", null], ball: S.ball };
  App.mid++;
  const fixed = resolveObs(cfg);
  Net.send({ t: "start", mid: App.mid, cfg: { ...fixed, mode: "guest", labels: [null, "DU"] } });
  beginMatch(fixed);
}

export function tryJoin(code) {
  code = String(code || $("codeIn").value).trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { netNote("Der Code hat 4 Zeichen.", true); return; }
  if (!Net.available()) { netNote("Online-Modus lädt noch. Versuch es gleich nochmal.", true); return; }
  saveName($("nameIn").value);
  netNote("Verbinde mit " + code.toUpperCase() + "…");
  Net.join(code, {
    onConn: () => Net.send({ t: "hello", name: S.name || "Gast", ch: S.char, lv: headLevel(S.char), v: VERSION }),
    onData: guestData,
    onClose: () => { if (App.mode === "guest" || App.screen === "lobby" || App.screen === "end") { toast("Gastgeber hat das Spiel verlassen"); quitToMenu(); } },
    onError: (t, wasOk) => {
      if (wasOk) return;
      Net.close();
      const msg = t === "peer-unavailable" ? "Kein Raum mit Code " + code.toUpperCase() + " gefunden." : t === "timeout" ? "Verbindung kam nicht zustande. Manche Netze (Schule, Firma) blockieren das. Mobile Daten helfen oft." : "Verbindung fehlgeschlagen (" + t + ").";
      if (App.screen !== "online") showScreen("online");
      netNote(msg, true);
    },
  });
}

export function guestData(d) {
  switch (d.t) {
    case "welcome":
      if (d.v !== VERSION) { Net.close(); showScreen("online"); netNote("Ihr habt verschiedene Spielversionen. Bitte beide die Seite neu laden.", true); break; }
      App.opp = { name: (d.name || "Gastgeber").slice(0, 12), ch: charById(d.ch).id }; App.netCfg = d.cfg; lobbyUI("guest");
      if (!App.mm) showScreen("lobby");   // Gegnersuche: keine Lobby, der Host pfeift gleich an
      A.sfx("coin"); break;
    case "cfg": App.netCfg = d.cfg; lobbyUI("guest"); break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; lobbyUI("guest"); } break;
    case "full": Net.close(); showScreen("online"); netNote("Der Raum ist schon voll.", true); break;
    case "start": App.mid = d.mid; beginMatch({ ...d.cfg, mode: "guest", labels: [null, "DU"] }); App.st.ph = "cd"; break;
    case "s":
      if (App.mode !== "guest" || d.mid !== App.mid) break; // alte Pakete vom letzten Spiel ignorieren
      App.snaps.push({ at: performance.now(), s: d.s });
      if (App.snaps.length > 12) App.snaps.shift();
      if (Array.isArray(d.ev)) d.ev.forEach(e => { if (e.t === "goal") App.replay = App.rec.slice(-160); onEvent(e, true); });
      break;
    case "lobby": if (!App.mm) backToLobby(); break;
    case "pong": App.rtt = performance.now() - d.c; break;
  }
}

export function backToLobby() {
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff();
  const role = Net.role();
  startDemo(); updateBand();
  lobbyUI(role === "host" ? "host" : "guest");
  App.stack = ["home"];
  showScreen("lobby");
}

export function sendNetCfg() { Net.send({ t: "cfg", cfg: App.netCfg }); lobbyUI(Net.role() === "host" ? "host" : "guest"); }
