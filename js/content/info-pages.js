// ERZEUGT von tools/gen-seo.mjs. Nicht von Hand ändern: npm run seo.
/** Infoseiten je Sprache und Art, Pfad relativ zur Startseite (Einstellungen → Info) */
export const INFO_PAGES = {
  "de": {
    "main": "de/",
    "friends": "de/gegen-freunde/"
  },
  "en": {
    "main": "en/",
    "friends": "en/play-with-friends/"
  },
  "es": {
    "main": "es/",
    "friends": "es/jugar-con-amigos/"
  },
  "pt": {
    "main": "pt/",
    "friends": "pt/#com-amigos"
  },
  "vi": {
    "main": "vi/",
    "friends": "vi/#choi-voi-ban-be"
  },
  "uk": {
    "main": "uk/",
    "friends": "uk/#z-druzyamy"
  },
  "ru": {
    "main": "ru/",
    "friends": "ru/#s-druzyami"
  }
};
/** Sprache, deren Seiten einspringen, wenn die Spielsprache eine Art weder als Seite noch als Abschnitt hat */
export const INFO_DEFAULT = "en";
