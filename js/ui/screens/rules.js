// Regeln: Presets, eigene Presets, Einstellungen in zwei Reitern
import { RULE_OPTS, RULE_PRESETS } from "../../content/config.js";
import { DEFAULT_RULES, matchLen } from "../../core/physics.js";
import { S, save } from "../../store.js";
import { $, esc, modal, seg, svg, toast } from "../dom.js";
import { showScreen } from "../nav.js";
import * as A from "../../adapters/audio/webaudio.js";

// Ein Regelsatz enthält nur Abweichungen vom Standard. Presets setzen alles außer der Spiellänge.
export let rulesCtx = null, rulesMoreOpen = false;

export const MAX_MY_PRESETS = 5;

export function showRulesTab(more) { rulesMoreOpen = more; renderRules(); }

export const ruleVal = (r, k) => (r && r[k] !== undefined ? r[k] : DEFAULT_RULES[k]);

export const sameRules = (a, b, skipLen = true) => RULE_OPTS.every(o => (skipLen && o.k === "len") || ruleVal(a, o.k) === ruleVal(b, o.k));

export const isStd = r => sameRules(r, {}, true);

export function presetOf(r) {
  if (isStd(r)) return STD_PRESET;
  return RULE_PRESETS.find(p => sameRules(r, p.rules)) || (S.myPresets || []).find(p => sameRules(r, p.rules)) || null;
}

export const STD_PRESET = { name: "Standard" };

export function lenText(r) { const ml = matchLen(r); return ml.win ? `Erster bis ${ml.win}` : ml.dur + " s"; }

export function changedText(r) {
  return RULE_OPTS.filter(o => o.k !== "len" && ruleVal(r, o.k) !== DEFAULT_RULES[o.k]).map(o => { const v = o.opts.find(x => x[0] === r[o.k]); return v ? `${o.name} ${v[1]}` : ""; }).filter(Boolean).join(" · ");
}

export function rulesSummary(r) {
  r = r || {};
  const p = presetOf(r);
  return (p ? p.name : changedText(r)) + " · " + lenText(r);
}

export function rulesScreen(target, onDone) {
  rulesCtx = { target, onDone };
  rulesMoreOpen = false;
  renderRules();
  showScreen("rules");
}

export function setRules(r, src) {
  const len = r.len, obs = r.obs;
  Object.keys(r).forEach(k => delete r[k]);
  Object.assign(r, src);
  delete r.len; delete r.obs;
  if (len !== undefined) r.len = len;
  if (obs !== undefined) r.obs = obs;
}

export function renderRules() {
  const r = rulesCtx.target, cur = presetOf(r);
  // Schnellwahl: 3 feste + eigene + Speichern
  const pr = $("rulePresets"); pr.innerHTML = "";
  const chip = (p, mine) => {
    const b = document.createElement("button");
    b.className = "preset" + (mine ? " mine" : "") + (cur === p ? " on" : "");
    if (!mine) { b.style.setProperty("--c1", p.c1); b.style.setProperty("--c2", p.c2); }
    b.innerHTML = `<b>${esc(p.name)}</b><small>${esc(mine ? changedText(p.rules) || "Standard" : p.desc)}</small>` + (cur === p ? `<span class="pchk">${svg("i-check")}</span>` : "");
    b.onclick = () => { A.sfx("click"); setRules(r, p.rules); renderRules(); };
    if (mine) {
      const x = document.createElement("span"); x.className = "pdel"; x.setAttribute("role", "button"); x.setAttribute("aria-label", p.name + " löschen"); x.innerHTML = svg("i-close");
      x.onclick = e => { e.stopPropagation(); A.sfx("click"); S.myPresets = S.myPresets.filter(q => q !== p); save(); toast(`„${p.name}“ gelöscht`, "i-close"); renderRules(); };
      b.append(x);
    }
    pr.append(b);
  };
  RULE_PRESETS.forEach(p => chip(p, false));
  (S.myPresets || []).forEach(p => chip(p, true));
  const sv = document.createElement("button"); sv.className = "preset add";
  const full = (S.myPresets || []).length >= MAX_MY_PRESETS;
  sv.disabled = !!cur || full;
  sv.innerHTML = `<b>${svg("i-plus")}Speichern</b><small>${full ? `Max. ${MAX_MY_PRESETS}, lösch eins` : cur ? "Erst etwas ändern" : "Als eigenes Preset"}</small>`;
  sv.onclick = savePresetDialog;
  pr.append(sv);
  // Einstellungen
  const row = o => {
    const d = document.createElement("div");
    const changed = ruleVal(r, o.k) !== DEFAULT_RULES[o.k];
    d.className = "rule" + (changed ? " changed" : "");
    d.innerHTML = `<h4>${o.name}<i class="cdot" title="geändert"></i></h4><div class="seg"></div>`;
    seg(d.querySelector(".seg"), o.opts.map(([v, t]) => ({ v, t })), ruleVal(r, o.k), v => { if (v === DEFAULT_RULES[o.k]) delete r[o.k]; else r[o.k] = v; renderRules(); });
    return d;
  };
  const list = $("ruleList"), more = $("ruleMore"); list.innerHTML = ""; more.innerHTML = "";
  RULE_OPTS.forEach(o => (o.more ? more : list).append(row(o)));
  const nMore = RULE_OPTS.filter(o => o.more && ruleVal(r, o.k) !== DEFAULT_RULES[o.k]).length;
  const mc = $("moreCount"); mc.hidden = !nMore; mc.textContent = nMore;
  more.hidden = !rulesMoreOpen; list.hidden = rulesMoreOpen;
  $("btnRulesMore").classList.toggle("on", rulesMoreOpen); $("rtCore").classList.toggle("on", !rulesMoreOpen);
  const nCore = RULE_OPTS.filter(o => !o.more && o.k !== "len" && ruleVal(r, o.k) !== DEFAULT_RULES[o.k]).length;
  $("rtCore").innerHTML = "Wichtig" + (nCore ? `<em>${nCore}</em>` : "");
  $("btnRulesReset").disabled = isStd(r) && ruleVal(r, "len") === DEFAULT_RULES.len;
  $("rulesNow").textContent = rulesSummary(r);
}

export function savePresetDialog() {
  A.sfx("click");
  const n = (S.myPresets || []).length + 1;
  modal({ title: "Preset speichern", body: `<p style="font-size:15px">So heißt es in der Schnellwahl.</p><input class="txt" id="presetName" maxlength="16" value="Mein Preset ${n}" aria-label="Name">`, btn: "Speichern", cancel: "Abbrechen", ribbon: "",
    onOk: () => {
      const name = ($("presetName").value || "").trim().slice(0, 16) || `Mein Preset ${n}`;
      const rules = { ...rulesCtx.target }; delete rules.len;
      S.myPresets = [...(S.myPresets || []), { id: "my" + Date.now(), name, rules }]; save();
      toast(`„${name}“ gespeichert`, "i-check", true); renderRules();
    } });
  setTimeout(() => { const i = $("presetName"); if (i) { i.focus(); i.select(); i.onkeydown = e => { if (e.key === "Enter") $("modalOk").click(); }; } }, 50);
}
