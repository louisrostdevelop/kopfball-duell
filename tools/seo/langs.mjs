// Sprachen der Infoseiten in dieser Reihenfolge (hreflang, Sitemap, Sprachumschalter, Aufnahmen in tools/gen-landing-media.mjs).
// Neue Sprache: tools/seo/<lang>.mjs nach dem Muster von en.mjs (Seiten nur für die Arten, die es dort geben soll), hier
// eintragen, Medien aufnehmen, `npm run seo`. Voraussetzung: das Spiel ist übersetzt (js/content/i18n/<lang>.js).
import de from "./de.mjs";
import en from "./en.mjs";

export const LANGS = [de, en];
/** Sprache für x-default */
export const DEFAULT_LANG = "en";
