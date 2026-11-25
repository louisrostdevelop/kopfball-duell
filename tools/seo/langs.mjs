// Sprachen der Infoseiten in dieser Reihenfolge (hreflang, Sitemap, Sprachumschalter, Aufnahmen in tools/gen-landing-media.mjs,
// veröffentlichte Ordner in .github/workflows/pages.yml).
// Neue Sprache: tools/seo/<lang>.mjs nach dem Muster von en.mjs (Seiten nur für die Arten, die es dort geben soll; Form wird
// gegen de.mjs geprüft), hier eintragen, Medien aufnehmen (tools/gen-landing-media.mjs), `npm run seo`.
// Außerhalb des Generators bleibt: das Spiel übersetzen (js/content/i18n/<lang>.js) und in index.html die Links auf die
// Infoseiten in den Einstellungen ergänzen (Spieltext-Schlüssel set.*; tests/sim/seo.test.mjs fordert sie ein).
import de from "./de.mjs";
import en from "./en.mjs";

export const LANGS = [de, en];
/** Sprache für x-default */
export const DEFAULT_LANG = "en";
/** Sprache, in der die sprachneutralen Bilder aufgenommen werden (Kopfball, Super-Schuss, Köpfe, Arenen, Modi) */
export const NEUTRAL_LANG = "de";
for (const l of [DEFAULT_LANG, NEUTRAL_LANG]) if (!LANGS.some(D => D.lang === l)) throw new Error("tools/seo/langs.mjs: Sprache fehlt in LANGS: " + l);
