// Sprachen der Infoseiten in dieser Reihenfolge (hreflang, Sitemap, Sprachumschalter, Aufnahmen in tools/gen-landing-media.mjs,
// veröffentlichte Ordner in .github/workflows/pages.yml).
// Neue Sprache: tools/seo/<lang>.mjs nach dem Muster von en.mjs (Seiten nur für die Arten, die es dort geben soll; Form wird
// gegen de.mjs geprüft), hier eintragen, Medien aufnehmen (tools/gen-landing-media.mjs), `npm run seo`.
// Außerhalb des Generators bleibt nur: das Spiel übersetzen (js/content/i18n/<lang>.js). Die Links in den Einstellungen
// (Info) zeigen von selbst auf die Infoseiten der Spielsprache (js/content/info-pages.js, erzeugt), sonst auf DEFAULT_LANG.
import de from "./de.mjs";
import en from "./en.mjs";
import es from "./es.mjs";
import pt from "./pt.mjs";

export const LANGS = [de, en, es, pt];
/** Sprache für x-default */
export const DEFAULT_LANG = "en";
/** Sprache, in der die sprachneutralen Bilder aufgenommen werden (Kopfball, Super-Schuss, Köpfe, Arenen, Modi) */
export const NEUTRAL_LANG = "de";
for (const l of [DEFAULT_LANG, NEUTRAL_LANG]) if (!LANGS.some(D => D.lang === l)) throw new Error("tools/seo/langs.mjs: Sprache fehlt in LANGS: " + l);
