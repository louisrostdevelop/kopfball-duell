// Mehrsprachigkeit: alle Texte stehen in js/content/i18n/<sprache>.js, im Code nur Schlüssel.
//   t("shop.buy", { price: 200 })  ->  "Kaufen · 200"   (Platzhalter {price}; Wert darf eine Funktion sein: p => ...)
// Spielinhalte (Modi, Arenen, Erfolge, ...) bekommen ihre Texte über localize(): die Felder werden zu Gettern,
// die beim Lesen übersetzen. So bleibt der übrige Code unverändert (z. B. m.name, a.desc).
// Fehlt ein Schlüssel in einer Sprache, gilt Deutsch; fehlt er ganz, steht der Schlüssel da (fällt im Test auf).
import de from "./i18n/de.js";
import en from "./i18n/en.js";

export const LANGS = { de, en };
export const LANG_NAMES = { de: "Deutsch", en: "English" };
let cur = "de";

/** Sprache des Geräts, falls wir sie haben, sonst Englisch */
export function detectLang(list = (globalThis.navigator && (navigator.languages || [navigator.language])) || []) {
  for (const l of list) { const k = String(l || "").slice(0, 2).toLowerCase(); if (LANGS[k]) return k; }
  return "en";
}
export function setLang(l) { cur = LANGS[l] ? l : "de"; if (globalThis.document) document.documentElement.lang = cur; return cur; }
export const lang = () => cur;

export function t(key, p) {
  let v = LANGS[cur][key];
  if (v === undefined) v = de[key];
  if (v === undefined) return key;
  if (typeof v === "function") return v(p || {});
  return p ? v.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m)) : v;
}
export const has = key => de[key] !== undefined;

/** Zahlen und Geld im Format der Sprache */
export const num = n => new Intl.NumberFormat(cur).format(n);
export const money = (cents, currency = "EUR") => new Intl.NumberFormat(cur, { style: "currency", currency }).format(cents / 100);

/** Felder von Inhalts-Objekten übersetzbar machen: Schlüssel = prefix.id.feld */
export function localize(list, prefix, fields, idKey = "id") {
  for (const o of list) for (const f of fields) {
    const key = `${prefix}.${o[idKey]}.${f}`;
    Object.defineProperty(o, f, { get: () => t(key), enumerable: true, configurable: true });
  }
  return list;
}
/** Objekt { schlüssel: egal } -> jeder Wert wird zu t(prefix.schlüssel) */
export function localizeKeys(obj, prefix) {
  for (const k of Object.keys(obj)) Object.defineProperty(obj, k, { get: () => t(`${prefix}.${k}`), enumerable: true, configurable: true });
  return obj;
}
