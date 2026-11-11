// Welche Browser-Tests gehören zu welchen Dateien? Für `npm run test:changed` (nur betroffene Tests).
// Lieber zu viel als zu wenig: Unbekannte Dateien starten alle Tests. Vor dem Schritt auf main läuft ohnehin alles.
import { execFileSync } from "node:child_process";

/** Online-Tests: zwei Tabs, nachgespieltes Netz, Zeitabhängigkeiten. Laufen nacheinander (gegenseitig zu empfindlich). */
export const NET = ["online", "resume", "rollback", "rbresume", "matchmaking", "server", "admin"];
/** Oberfläche: läuft bei jeder Änderung an Oberfläche, Texten oder Ablauf mit (deckt jeden Modus einmal ab) */
const UI = ["ui", "layout", "menus", "modes", "i18n"];
const PLAY = ["offline", "controls", "career", "shoe", "bot", "powerups", "ui"];

// [Muster, Tests]. "*" = alle. Mehrere Treffer werden zusammengezählt.
const RULES = [
  [/^(.*\.md$|LICENSE|\.gitignore$)/, []],
  [/^tests\/sim\//, []],                                   // Unit-Tests laufen bei test:changed sowieso alle
  [/^tests\/e2e\/(\w+)\.test\.mjs$/, m => [m[1]]],
  [/^tests\/e2e\/(lib\.mjs|mockpeer\.js)$/, "*"],
  [/^tools\/(e2e|test-map)\.mjs$/, "*"],
  [/^tools\/(serve|dev-backend)\.mjs$/, "*"],
  [/^(package(-lock)?\.json|eslint\.config\.js|\.stylelintrc.*)$/, "*"],
  [/^\.github\/workflows\/tests\.yml$/, "*"],              // Browser-Job selbst geändert: alles prüfen
  [/^\.github\//, []],
  [/^tools\/(balance|sound-lab|brand)\/|^tools\/botlab\.mjs$|^supabase\/ops\//, []],   // Werkzeuge, nicht ausgeliefert
  [/^supabase\//, ["server", "matchmaking", "admin"]],
  [/^(admin\.html$|js\/admin\/|css\/admin\.css$)/, ["admin"]],   // Admin-Dashboard, eigene Seite
  // Spiellogik und Netzcode: alles, was spielt
  [/^js\/core\/(sim\/|bot\/|physics|rollback|rbpeer|rbgame)|^js\/content\/(dmath|config|tuning)/, [...NET, ...PLAY]],
  [/^js\/app\/(online|rbnet|netcode|session|game|loop|results|state)\.js$/, [...NET, "offline", "ui"]],   // state.js: Online-Protokoll (VERSION)
  [/^js\/app\/(matchmaking|activity)\.js$/, ["matchmaking", "server", "modes", "ui"]],
  [/^js\/(app\/(account|services)|adapters\/|ports\/)/, ["server", "matchmaking", "menus", "ui", "admin"]],
  [/^js\/app\/track\.js$/, ["server", "admin"]],
  [/^js\/(content\/career|core\/career|ui\/screens\/career)/, ["career", "server", "ui"]],
  [/^js\/core\/economy\.js$/, ["career", "server", "chests", "offline", "menus", "cosmetics", "ui"]],
  [/^js\/(app\/cosmetics|content\/cosmetics|ui\/screens\/locker)|^js\/ui\/render\/(frames|shoes)/, ["cosmetics", "online", "ui"]],
  [/^js\/ui\/render\/balls/, ["balls", "ui"]],
  [/^js\/ui\/render\/(powerup-|render\.js$|art\.js$)|^js\/app\/(effects|loop|rbnet)\.js$|^js\/adapters\/audio\//, ["powerups"]],   // Power-ups: Darstellung und Ton
  [/^js\/(content\/layouts|core\/sim\/obstacles)|^js\/ui\/render\/(arena|field)/, ["arenas", "ui"]],
  [/^js\/(core\/chests|ui\/screens\/chests)/, ["chests", "server", "ui"]],
  [/^js\/(ui\/controls|adapters\/input)/, ["controls", "ui"]],
  [/^js\/(adapters\/audio\/|ui\/screens\/settings\.js$|main\.js$)/, ["audio"]],   // Ton-Schalter
  [/^js\/ui\/screens\/(online|search)\.js$/, ["online", "matchmaking", "layout", "ui"]],
  [/^js\/content\/i18n/, ["i18n", ...UI]],
  [/^(css\/|index\.html$|js\/ui\/|js\/main\.js$|js\/app\/)/, UI],
  [/^js\/content\//, UI],
  [/^(sw\.js|manifest\.webmanifest)$/, ["offline", "ui"]],
  [/^(fonts|icons|audio|legal|vendor)\//, ["ui"]],
  [/^(og\.jpg|CNAME)$/, []],
];

/** Tests (Namen ohne .test.mjs) für geänderte Dateien; all = alle Testnamen. Liefert { tests, why } */
export function testsFor(files, all) {
  const set = new Set(), why = [];
  for (const f of files) {
    let hit = false, every = false; const mine = new Set();
    for (const [re, t] of RULES) {
      const m = re.exec(f); if (!m) continue;
      hit = true;
      if (t === "*") { every = true; break; }
      (typeof t === "function" ? t(m) : t).forEach(x => mine.add(x));
    }
    if (!hit || every) all.forEach(x => mine.add(x));
    mine.forEach(x => set.add(x));
    why.push(`${f} → ${!hit ? "alle (unbekannt)" : every ? "alle" : [...mine].join(", ") || "keine"}`);
  }
  return { tests: all.filter(x => set.has(x)), why };
}

/** Lohnt der zweite Lauf auf einem Kern (findet Zeitfehler im Netzcode)? Nur bei Netzcode und Spiellogik */
export const needsStress = files => files.some(f => /^js\/core\/(sim\/|bot\/|physics|rollback|rbpeer|rbgame)|^js\/content\/(dmath|config)\.js$|^js\/app\/(online|rbnet|netcode|session|loop)\.js$|^tests\/e2e\/(mockpeer|lib)/.test(f));

/** geänderte Dateien gegen ref (Commits seit dem gemeinsamen Stand) plus Arbeitsstand und neue Dateien */
export function changedFiles(cwd, ref = "origin/main") {
  const git = (...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
  const base = git("merge-base", ref, "HEAD")[0];
  return [...new Set([...git("diff", "--name-only", "--no-renames", base), ...git("ls-files", "--others", "--exclude-standard")])].sort();
}
