// Endbildschirm
import { S, xpFor } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { App } from "../../app/state.js";
import { $, esc, toast } from "../dom.js";
import { levelModal } from "../modals.js";
import { showScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { endAgain, endMenu, shareResult } from "../../app/results.js";
import { t } from "../../content/i18n.js";
import { CAREER } from "../../content/career.js";
import { ARENAS } from "../../content/config.js";

export function showEnd(r) {
  const st = App.st, [a, b] = st.s, me = r.me;
  const ttl = $("endTitle");
  if (me < 0) { ttl.textContent = a === b ? t("end.draw") : t("end.wins", { name: App.names[a > b ? 0 : 1] }); ttl.className = "ribbon gold"; }
  else if (r.win) { ttl.textContent = r.runInfo === "cup" ? t("trophy.title") : t("end.win"); ttl.className = "ribbon" + (r.runInfo === "cup" ? " gold" : ""); }
  else { ttl.textContent = a === b ? t("end.draw") : t("end.loss"); ttl.className = "ribbon " + (a === b ? "draw" : "lose"); }
  ttl.closest(".endcard").dataset.tone = /gold/.test(ttl.className) ? "gold" : /lose/.test(ttl.className) ? "lose" : /draw/.test(ttl.className) ? "draw" : "win";
  [0, 1].forEach(i => { const av = $("endAv" + i); av.innerHTML = ""; const won = st.s[i] > st.s[1 - i]; av.append(avatarCanvas(st.p[i].ch, 84, { dir: i ? -1 : 1, mood: won ? "happy" : st.s[i] < st.s[1 - i] ? "sad" : "" })); $("endN" + i).textContent = App.names[i]; });
  $("endS0").textContent = a; $("endS1").textContent = b;
  const s0 = st.stats[0], s1 = st.stats[1];
  const rows = [[t("stat.shots"), s0.shots, s1.shots], [t("stat.headers"), s0.heads, s1.heads], [t("stat.supers"), s0.supers, s1.supers], [t("stat.pus"), s0.pus, s1.pus], [t("stat.stomps"), s0.stomps, s1.stomps]].filter(row => row[1] + row[2] > 0);
  $("endStats").innerHTML = rows.map(([l, x, y]) => `<span class="st"><span class="v">${x}</span><span class="lbl">${l}</span><span class="v r">${y}</span></span>`).join("");
  const rw = $("endRewards"); rw.innerHTML = "";
  r.lines.forEach(([l, c], n) => { const d = document.createElement("div"); d.className = "rw-line"; d.style.animationDelay = (0.2 + n * 0.22) + "s"; d.innerHTML = `<span class="coin"></span><b>+${c}</b><span>${esc(l)}</span>`; rw.append(d); setTimeout(() => A.sfx("coin"), 200 + n * 220); });
  if (r.lines.length) {
    const xp = document.createElement("div"); xp.className = "xpwrap rw-line"; xp.style.animationDelay = (0.3 + r.lines.length * 0.22) + "s";
    xp.innerHTML = `<span>${t("level.title", { n: S.level })}</span><span class="xpbar"><i style="width:0%"></i></span>`; rw.append(xp);
    setTimeout(() => { const i = xp.querySelector("i"); if (i) i.style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%"; }, 50);
  }
  r.achs.forEach((ac, n) => setTimeout(() => { toast(t("ach.toast", { name: ac.name, n: ac.reward }), "i-star", true); A.sfx("levelup"); }, 900 + n * 1200));
  if (r.ups.length) setTimeout(() => levelModal(r.ups[r.ups.length - 1]), 1500);
  // Arena ab diesem Level frei
  ARENAS.filter(x => x.level && r.ups.includes(x.level)).forEach((ar, n) => setTimeout(() => toast(t("arena.unlocked", { name: ar.name }), "i-stadium", true), 2600 + n * 1200));
  if (r.runInfo === "record") setTimeout(() => toast(t("end.newRecord"), "i-inf", true), 700);
  if (r.career && r.career.gained) setTimeout(() => toast(t("career.newStars", { n: r.career.gained }), "i-star", true), 700);
  if (r.career && r.career.leagueDone) setTimeout(() => toast(r.career.unlocked >= 0 ? t("career.unlocked", { name: CAREER[r.career.unlocked].name }) : t("career.allDone"), "i-trophy", true), 1900);
  const again = $("btnEndAgain"), note = $("endNote"), menu = $("btnEndMenu");
  note.textContent = ""; again.hidden = false; again.disabled = false; again.className = "btn yellow big";
  menu.textContent = t("end.menu");
  switch (App.mode) {
    case "cup": case "endless": again.textContent = t(App.run && !App.run.done ? "ui.next" : "ui.done"); break;
    case "guest": again.textContent = t("end.rematchAsk"); note.textContent = t("end.hostStarts"); menu.textContent = t("end.leave"); break;
    case "host": again.textContent = t("end.rematch"); menu.textContent = t("end.lobby"); break;
    case "daily": again.textContent = t("end.again"); break;
    case "career": again.textContent = t("ui.next"); break;
    default: again.textContent = t("end.rematch");
  }
  if (App.mm) { again.textContent = t("end.nextOpp"); menu.textContent = t("end.menu"); note.textContent = t(App.mm.mode === "ranked" ? "end.bookingRating" : "end.bookingResult"); }
  showScreen("end");
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initEnd() {
  $("btnEndAgain").onclick = endAgain;
  $("btnEndMenu").onclick = endMenu;
  $("btnEndShare").onclick = shareResult;
}
