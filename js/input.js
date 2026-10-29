// Eingabe: Tastatur, Touch (schwebender Stick + Buttons), Controller
const keys = new Set();
const touch = [{}, {}];
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
    if (!keys.has(e.code)) hooks.onKey && hooks.onKey(e.code);
    keys.add(e.code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code) && hooks.inGame && hooks.inGame()) e.preventDefault();
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => { keys.clear(); clearTouch(); });
  window.addEventListener("touchstart", () => { if (!isTouch) { isTouch = true; document.body.classList.add("is-touch"); setLayout(layout, true); } }, { passive: true });
  if (isTouch) document.body.classList.add("is-touch");
  document.addEventListener("contextmenu", e => { if (hooks.inGame && hooks.inGame()) e.preventDefault(); });
}
function clearTouch() { [0, 1].forEach(i => { for (const k in touch[i]) touch[i][k] = false; }); }

const K = [
  { l: ["KeyA"], r: ["KeyD"], j: ["KeyW"], k: ["KeyS", "Space"], s: ["KeyE", "ShiftLeft"] },
  { l: ["ArrowLeft"], r: ["ArrowRight"], j: ["ArrowUp"], k: ["ArrowDown", "Enter"], s: ["ShiftRight", "Period", "Numpad0", "Slash"] },
];
const anyKey = list => list.some(c => keys.has(c));
function kb(set) { const m = K[set]; return { l: anyKey(m.l), r: anyKey(m.r), j: anyKey(m.j), k: anyKey(m.k), s: anyKey(m.s) }; }
const or = (...a) => ({ l: a.some(x => x.l), r: a.some(x => x.r), j: a.some(x => x.j), k: a.some(x => x.k), s: a.some(x => x.s) });

// mode: "single" (ein Mensch, alle Tasten), "local" (zwei Menschen)
export function getInput(i, mode) {
  if (mode === "local") return or(kb(i), touch[i], pads[i]);
  return or(kb(0), kb(1), touch[0], pads[0], pads[1]);
}

// ---------- Controller ----------
export function pollPads() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  const got = [];
  for (const g of list) if (g && g.connected) got.push(g);
  [0, 1].forEach(i => {
    const g = got[i], o = pads[i];
    if (!g) { o.l = o.r = o.j = o.k = o.s = false; return; }
    const b = n => !!(g.buttons[n] && (g.buttons[n].pressed || g.buttons[n].value > 0.5));
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    o.l = ax < -0.35 || b(14); o.r = ax > 0.35 || b(15);
    o.j = b(0) || b(12) || ay < -0.7; o.k = b(2) || b(1) || b(7); o.s = b(3) || b(5) || b(6) || b(4);
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
  base.append(knob); z.append(base); root.append(z);
  const hint = el("div", "stickhint"); hint.innerHTML = '<span class="sh-pad">◀ ▶</span><span>Hier ziehen zum Laufen<small>Hoch wischen = Sprung</small></span>'; z.append(hint);
  let id = null, ax = 0, ay = 0;
  const set = (dx, dy) => {
    const t = touch[pi];
    t.l = dx < -14; t.r = dx > 14; t.j = dy < -42;
    knob.style.transform = `translate(${Math.max(-46, Math.min(46, dx))}px, ${Math.max(-46, Math.min(46, dy))}px)`;
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
    // Stick folgt dem Finger, damit Richtungswechsel schnell gehen
    if (Math.abs(dx) > 60) { ax += dx - Math.sign(dx) * 60; dx = Math.sign(dx) * 60; const r = z.getBoundingClientRect(); base.style.left = (ax - r.left) + "px"; }
    if (dy > 40) { ay += dy - 40; dy = 40; const r = z.getBoundingClientRect(); base.style.top = (ay - r.top) + "px"; }
    set(dx, dy);
  });
  const up = e => { if (e.pointerId !== id) return; id = null; base.classList.remove("on"); set(0, 0); };
  z.addEventListener("pointerup", up); z.addEventListener("pointercancel", up); z.addEventListener("lostpointercapture", up);
}

function slider(pi, side) {
  const s = el("div", "slider " + side + " p" + (pi + 1)), knob = el("div", "sknob");
  s.innerHTML = "<i>◀</i><i>▶</i>"; s.append(knob); root.append(s);
  let id = null;
  const upd = e => {
    const r = s.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2);
    touch[pi].l = dx < -12; touch[pi].r = dx > 12;
    knob.style.transform = `translateX(${Math.max(-r.width / 2 + 28, Math.min(r.width / 2 - 28, dx))}px)`;
  };
  s.addEventListener("pointerdown", e => { if (id !== null) return; e.preventDefault(); id = e.pointerId; try { s.setPointerCapture(id); } catch (_) {} s.classList.add("on"); upd(e); });
  s.addEventListener("pointermove", e => { if (e.pointerId === id) upd(e); });
  const up = e => { if (e.pointerId !== id) return; id = null; s.classList.remove("on"); touch[pi].l = touch[pi].r = false; knob.style.transform = ""; };
  s.addEventListener("pointerup", up); s.addEventListener("pointercancel", up); s.addEventListener("lostpointercapture", up);
}

function buttons(pi, side, big) {
  const wrap = el("div", "tbtns " + side + (big ? " big" : " small") + " p" + (pi + 1));
  const mk = (act, label, cls) => {
    const b = el("button", "tbtn " + cls); b.type = "button"; b.innerHTML = label; b.dataset.act = act;
    const ids = new Set();
    const upd = () => { touch[pi][act] = ids.size > 0; b.classList.toggle("on", ids.size > 0); };
    b.addEventListener("pointerdown", e => { e.preventDefault(); ids.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (_) {} upd(); hooks.onTouch && hooks.onTouch(); if (act === "k" || act === "s") vibrate(8); });
    const off = e => { ids.delete(e.pointerId); upd(); };
    b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
    return b;
  };
  const sup = mk("s", '<svg><use href="#i-bolt"/></svg><span>SUPER</span>', "sup");
  sup.dataset.pi = pi;
  const jmp = mk("j", '<svg viewBox="0 0 24 24"><path d="M12 3 3 13h5.5v8h7v-8H21z"/></svg><span>SPRUNG</span>', "jmp");
  const kck = mk("k", '<svg><use href="#i-ball"/></svg><span>SCHUSS</span><b class="charge"></b>', "kck");
  if (big) wrap.append(sup, jmp, kck); else wrap.append(kck, jmp, sup);
  root.append(wrap);
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
  });
}
export function touchFor(i) { return touch[i]; }

let vibOn = true;
export function setVibration(on) { vibOn = on; }
export function vibrate(ms) { if (vibOn && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) {} }
export function keyDown(code) { return keys.has(code); }

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
