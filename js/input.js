// Eingabe: Tastatur, Touch (schwebender Stick + Buttons), Controller
const keys = new Set();
const touch = [{}, {}];
// tap[i] = Aktionen, die seit dem letzten Lesen gedrückt wurden (auch wenn sie schon wieder losgelassen sind)
const tap = [{}, {}];
const kbTap = new Set();
const pads = [{}, {}];
let layout = "none", root = null, hooks = {};
let padPrev = [];
export let isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
export let usedPad = false;

export function initInput(h) {
  hooks = h;
  root = document.getElementById("touch");
  window.addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!keys.has(e.code)) { hooks.onKey && hooks.onKey(e.code); kbTap.add(e.code); }
    keys.add(e.code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code) && hooks.inGame && hooks.inGame()) e.preventDefault();
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => { keys.clear(); clearTouch(); });
  window.addEventListener("touchstart", () => { if (!isTouch) { isTouch = true; document.body.classList.add("is-touch"); setLayout(layout, true); } }, { passive: true });
  if (isTouch) document.body.classList.add("is-touch");
  document.addEventListener("contextmenu", e => { if (hooks.inGame && hooks.inGame()) e.preventDefault(); });
}
function clearTouch() { [0, 1].forEach(i => { for (const k in touch[i]) touch[i][k] = false; tap[i] = {}; }); }
function press(pi, act, on) {
  if (on && !touch[pi][act]) { tap[pi][act] = true; if (act !== "s") vibrate(act === "k" ? 10 : 7); }
  touch[pi][act] = on;
}

const K = [
  { l: ["KeyA"], r: ["KeyD"], j: ["KeyW"], d: ["KeyS"], k: ["Space"], s: ["KeyE", "ShiftLeft"] },
  { l: ["ArrowLeft"], r: ["ArrowRight"], j: ["ArrowUp"], d: ["ArrowDown"], k: ["Enter", "NumpadEnter"], s: ["ShiftRight", "Period", "Numpad0", "Slash"] },
];
const anyKey = list => list.some(c => keys.has(c));
const anyTap = list => list.some(c => kbTap.has(c));
function kb(set) { const m = K[set]; return { l: anyKey(m.l), r: anyKey(m.r), j: anyKey(m.j) || anyTap(m.j), d: anyKey(m.d) || anyTap(m.d), k: anyKey(m.k) || anyTap(m.k), s: anyKey(m.s) || anyTap(m.s) }; }
function tch(i) { const t = touch[i], q = tap[i], o = { l: !!t.l, r: !!t.r, j: !!(t.j || q.j), d: !!(t.d || q.d), k: !!(t.k || q.k), s: !!(t.s || q.s) }; tap[i] = {}; return o; }
const or = (...a) => ({ l: a.some(x => x.l), r: a.some(x => x.r), j: a.some(x => x.j), d: a.some(x => x.d), k: a.some(x => x.k), s: a.some(x => x.s) });

// mode: "single" (ein Mensch, alle Tasten), "local" (zwei Menschen)
export function getInput(i, mode) {
  let o;
  if (mode === "local") { o = or(kb(i), tch(i), pads[i]); K[i] && [...K[i].j, ...K[i].d, ...K[i].k, ...K[i].s].forEach(c => kbTap.delete(c)); }
  else { o = or(kb(0), kb(1), tch(0), pads[0], pads[1]); kbTap.clear(); }
  return o;
}

// ---------- Controller ----------
export function pollPads() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  const got = [];
  for (const g of list) if (g && g.connected) got.push(g);
  [0, 1].forEach(i => {
    const g = got[i], o = pads[i];
    if (!g) { o.l = o.r = o.j = o.d = o.k = o.s = false; return; }
    const b = n => !!(g.buttons[n] && (g.buttons[n].pressed || g.buttons[n].value > 0.5));
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    o.l = ax < -0.35 || b(14); o.r = ax > 0.35 || b(15);
    o.j = b(0) || b(12) || ay < -0.7; o.d = b(13) || ay > 0.75; o.k = b(2) || b(1) || b(7); o.s = b(3) || b(5) || b(6) || b(4);
    const prev = padPrev[i] || [];
    const now = g.buttons.map((_, n) => b(n));
    if (now.some((v, n) => v && !prev[n])) { usedPad = true; hooks.onPadButton && now.forEach((v, n) => { if (v && !prev[n]) hooks.onPadButton(n, i); }); }
    if (Math.abs(ax) > 0.6 && !(prev.ax)) hooks.onPadButton && hooks.onPadButton(ax < 0 ? 14 : 15, i);
    if (Math.abs(ay) > 0.6 && !(prev.ay)) hooks.onPadButton && hooks.onPadButton(ay < 0 ? 12 : 13, i);
    now.ax = Math.abs(ax) > 0.6; now.ay = Math.abs(ay) > 0.6;
    padPrev[i] = now;
  });
}

// ---------- Touch ----------
export function setLayout(kind, force) {
  if (kind === layout && !force) return;
  layout = kind; clearTouch();
  if (!root) return;
  root.innerHTML = "";
  root.className = "touch " + kind;
  if (!isTouch || kind === "none") return;
  if (kind === "single") { stickZone(0); buttons(0, "right", true); }
  else if (kind === "split") { slider(0, "left"); buttons(0, "left", false); slider(1, "right"); buttons(1, "right", false); }
}

function stickZone(pi) {
  const z = el("div", "stickzone"), base = el("div", "stick"), knob = el("div", "knob");
  base.innerHTML = '<i class="sk-up">▲</i><i class="sk-dn">▼</i>';
  base.append(knob); z.append(base); root.append(z);
  const hint = el("div", "stickhint"); hint.innerHTML = '<span class="sh-pad">◀ ▶</span><span>Hier ziehen zum Laufen<small>Hoch = Sprung · Runter = Grätsche</small></span>'; z.append(hint);
  let id = null, ax = 0, ay = 0;
  // Sprung: schon schräg nach oben (ab ca. 27°) reicht, damit man im Laufen springen kann.
  // Einmal ausgelöst, bleibt er gehalten, bis der Daumen fast wieder unten ist (sonst wird aus dem hohen Sprung ein halber).
  // Grätsche/Bombe bleibt streng (deutlich nach unten), damit man im Laufen nicht aus Versehen grätscht.
  let jOn = false, dOn = false;
  const set = (dx, dy) => {
    const ax = Math.abs(dx);
    jOn = jOn ? dy < -18 : dy < -42 && -dy > ax * 0.5;
    dOn = dOn ? dy > 18 : dy > 36 && dy > ax * 0.9;
    if (jOn) dOn = false;
    press(pi, "l", dx < -12); press(pi, "r", dx > 12);
    press(pi, "j", jOn);
    press(pi, "d", dOn);
    base.classList.toggle("up", jOn); base.classList.toggle("dn", dOn);
    knob.style.transform = `translate(${Math.max(-48, Math.min(48, dx))}px, ${Math.max(-48, Math.min(48, dy))}px)`;
  };
  z.addEventListener("pointerdown", e => {
    if (id !== null) return; e.preventDefault(); id = e.pointerId;
    try { z.setPointerCapture(id); } catch (_) {}
    const r = z.getBoundingClientRect(); ax = e.clientX; ay = e.clientY;
    base.style.left = (ax - r.left) + "px"; base.style.top = (ay - r.top) + "px";
    base.classList.add("on"); hint.classList.add("gone"); set(0, 0); hooks.onTouch && hooks.onTouch();
  });
  z.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ax, dy = e.clientY - ay;
    // Stick folgt dem Finger seitlich, damit Richtungswechsel schnell gehen
    if (Math.abs(dx) > 60) { ax += dx - Math.sign(dx) * 60; dx = Math.sign(dx) * 60; const r = z.getBoundingClientRect(); base.style.left = (ax - r.left) + "px"; }
    if (Math.abs(dy) > 70) { ay += dy - Math.sign(dy) * 70; dy = Math.sign(dy) * 70; const r = z.getBoundingClientRect(); base.style.top = (ay - r.top) + "px"; }
    set(dx, dy);
  });
  const up = e => { if (e.pointerId !== id) return; id = null; base.classList.remove("on", "up", "dn"); set(0, 0); };
  z.addEventListener("pointerup", up); z.addEventListener("pointercancel", up); z.addEventListener("lostpointercapture", up);
}

function slider(pi, side) {
  const s = el("div", "slider " + side + " p" + (pi + 1)), knob = el("div", "sknob");
  s.innerHTML = "<i>◀</i><i>▶</i>"; s.append(knob); root.append(s);
  let id = null;
  const upd = e => {
    const r = s.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2);
    press(pi, "l", dx < -12); press(pi, "r", dx > 12);
    knob.style.transform = `translateX(${Math.max(-r.width / 2 + 26, Math.min(r.width / 2 - 26, dx))}px)`;
  };
  s.addEventListener("pointerdown", e => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { s.setPointerCapture(id); } catch (_) {} s.classList.add("on"); upd(e); });
  s.addEventListener("pointermove", e => { if (e.pointerId === id) upd(e); });
  const up = e => { if (e.pointerId !== id) return; id = null; s.classList.remove("on"); press(pi, "l", false); press(pi, "r", false); knob.style.transform = ""; };
  s.addEventListener("pointerup", up); s.addEventListener("pointercancel", up); s.addEventListener("lostpointercapture", up);
}

// Tastenfeld: die sichtbaren Tasten liegen in einer unsichtbaren Zone. Jeder Finger zählt für die nächstgelegene Taste
// (großzügiger Radius), und wer mit dem Daumen auf eine andere Taste rutscht, wechselt sauber dorthin.
function buttons(pi, side, big) {
  const zone = el("div", "tzone " + side + (big ? " big" : " small") + " p" + (pi + 1));
  const wrap = el("div", "tbtns " + side + (big ? " big" : " small") + " p" + (pi + 1));
  const defs = [
    ["s", '<svg><use href="#i-bolt"/></svg><span>SUPER</span>', "sup"],
    ["d", '<svg viewBox="0 0 24 24"><path d="M12 21 3 11h5.5V3h7v8H21z"/></svg><span>GRÄTSCHE</span>', "dwn"],
    ["j", '<svg viewBox="0 0 24 24"><path d="M12 3 3 13h5.5v8h7v-8H21z"/></svg><span>SPRUNG</span>', "jmp"],
    ["k", '<svg><use href="#i-ball"/></svg><span>SCHUSS</span><b class="charge"></b>', "kck"],
  ];
  const btn = {};
  (big || side === "left" ? defs : defs.slice().reverse()).forEach(([act, html, cls]) => {
    const b = el("div", "tbtn " + cls); b.innerHTML = html; b.dataset.act = act; wrap.append(b); btn[act] = b;
  });
  zone.append(wrap); root.append(zone);
  const fingers = new Map(); // pointerId -> Aktion
  const sync = () => {
    const held = new Set(fingers.values());
    for (const act of ["s", "d", "j", "k"]) { press(pi, act, held.has(act)); btn[act].classList.toggle("on", held.has(act)); }
  };
  const nearest = (x, y) => {
    let best = null, bd = 1e9;
    for (const act in btn) { const r = btn[act].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(x - cx, y - cy) / (r.width / 2); if (d < bd) { bd = d; best = act; } }
    return bd < 2.6 ? best : null;
  };
  zone.addEventListener("pointerdown", e => {
    e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    const act = nearest(e.clientX, e.clientY); if (!act) return;
    fingers.set(e.pointerId, act); sync(); hooks.onTouch && hooks.onTouch();
  });
  zone.addEventListener("pointermove", e => {
    if (!fingers.has(e.pointerId)) return;
    const act = nearest(e.clientX, e.clientY);
    // Schuss wird beim Loslassen ausgelöst: vom Schuss weg auf eine andere Taste rutschen = Schuss loslassen
    if (act && act !== fingers.get(e.pointerId)) { fingers.set(e.pointerId, act); sync(); }
  });
  const off = e => { if (!fingers.has(e.pointerId)) return; fingers.delete(e.pointerId); sync(); };
  zone.addEventListener("pointerup", off); zone.addEventListener("pointercancel", off); zone.addEventListener("lostpointercapture", off);
}

// Super-Button leuchtet, wenn bereit; Schuss-Button zeigt Aufladung
export function touchHud(st) {
  if (!root || !isTouch || layout === "none") return;
  root.querySelectorAll(".tbtns").forEach(w => {
    const pi = w.classList.contains("p2") ? 1 : 0, p = st.p[pi];
    if (!p) return;
    const sup = w.querySelector(".sup");
    if (sup) { sup.classList.toggle("ready", !!p.full); sup.style.setProperty("--m", (p.full ? 100 : p.meter) + "%"); sup.classList.toggle("armed", p.armed > 0); }
    const ch = w.querySelector(".charge"); if (ch) ch.style.setProperty("--c", Math.round(p.charge * 100) + "%");
    const dw = w.querySelector(".dwn span"), lab = p.onG ? "GRÄTSCHE" : "BOMBE";
    if (dw && dw.textContent !== lab) dw.textContent = lab;
  });
}
export function touchFor(i) { return touch[i]; }

let vibOn = true;
export function setVibration(on) { vibOn = on; }
export function vibrate(ms) { if (vibOn && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) {} }
export function keyDown(code) { return keys.has(code); }

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
