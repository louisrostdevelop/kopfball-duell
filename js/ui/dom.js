// Kleine DOM-Helfer: Elemente, Umschalter, Hinweise, Dialoge, Teilen, Fokus für Controller
import { audio as A, input as I } from "../app/services.js";
import { t } from "../content/i18n.js";

export const $ = id => document.getElementById(id);

export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const RCOL = { basis: "var(--r-basis)", selten: "var(--r-selten)", episch: "var(--r-episch)", legend: "var(--r-legend)" };

export const svg = id => `<svg><use href="#${id}"/></svg>`;
/** Leerer Zustand: großes Symbol + Satz, mittig (statt einer kleinen Textzeile auf leerer Fläche) */
export const emptyState = (icon, text) => `<div class="emptystate">${svg(icon)}<p>${esc(text)}</p></div>`;

export function shareOrCopy(d) {
  if (navigator.share) { navigator.share(d).catch(() => {}); return; }
  copyText([d.text, d.url].filter(Boolean).join(" "));
}

export function copyText(s) { try { navigator.clipboard.writeText(s).then(() => toast(t("ui.copied"), "i-check"), () => toast(s)); } catch (_) { toast(s); } }

export function seg(el, opts, cur, on) {
  el.innerHTML = "";
  opts.forEach(o => {
    const b = document.createElement("button"); b.textContent = o.t; b.classList.toggle("on", o.v === cur); b.disabled = !!o.dis;
    b.onclick = () => { A.sfx("click"); $$("button", el).forEach(x => x.classList.remove("on")); b.classList.add("on"); on(o.v); };
    el.append(b);
  });
}

export function toggle(el, v, on) {
  el.setAttribute("aria-pressed", v ? "true" : "false");
  el.onclick = () => { const nv = el.getAttribute("aria-pressed") !== "true"; el.setAttribute("aria-pressed", nv ? "true" : "false"); A.sfx("click"); on(nv); };
}

export function toast(text, icon, gold) {
  const el = document.createElement("div"); el.className = "toast" + (gold ? " gold" : "");
  el.innerHTML = (icon ? svg(icon) : "") + `<span>${esc(text)}</span>`;
  $("toasts").append(el); setTimeout(() => el.remove(), 3300);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
}

export function modal({ title, icon, body, btn = t("ui.next"), onOk, cancel, ribbon = "gold", cls = "" }) {
  const m = $("modal"), c = $("modalCard");
  c.className = "modalcard" + (cls ? " " + cls : "");
  c.innerHTML = `<div class="ribbon ${ribbon}">${esc(title)}</div>` + (icon ? `<svg class="bigic"><use href="#${icon}"/></svg>` : "") + body + `<button class="btn yellow big" id="modalOk">${btn}</button>` + (cancel ? `<button class="btn ghost small" id="modalCancel">${cancel}</button>` : "");
  m.hidden = false;
  $("modalOk").onclick = () => { A.sfx("click"); m.hidden = true; onOk && onOk(); };
  if (cancel) $("modalCancel").onclick = () => { A.sfx("click"); m.hidden = true; };
  if (I.usedPad) $("modalOk").focus();
}

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function focusFirst(scr) { const f = scr.querySelector(".btn-play, .btn:not(:disabled), button:not(:disabled)"); if (f) f.focus(); }

export function moveFocus(scr, [dx, dy]) {
  const items = $$("button:not(:disabled), input", scr).filter(e => e.offsetParent !== null);
  const cur = document.activeElement;
  if (!cur || !scr.contains(cur)) { focusFirst(scr); return; }
  const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
  let best = null, bd = 1e9;
  for (const e of items) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2];
    const vx = c[0] - c0[0], vy = c[1] - c0[1], along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const d = along + Math.abs(vx * dy - vy * dx) * 2.2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); A.sfx("tick"); }
}

/** Feste Texte im HTML übersetzen: data-i18n="schlüssel" (Text) und data-i18n-attr="attr:schlüssel;attr2:schlüssel2" */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(";")) { const [a, k] = pair.split(":"); if (a && k) el.setAttribute(a, t(k)); }
  });
}
