// Bot-Stufen: wie gut er sieht, wie klug er wählt, wie sauber er ausführt (Startwerte, im Messlabor eingestellt)
// react: Reaktionszeit auf einen neuen Plan (s) · think: Denkpause (s) · perr: Vorhersagefehler je Sekunde Vorausschau (px)
// tjit: Timing-Streuung von Sprung und Schwung (s) · best: Anteil, mit dem er die beste Option wählt (sonst eine der nächstbesten)
// hes: Zögern beim Schuss (Anteil) · slide/sup: Neigung zu Grätsche und Super · tap: Tastendrücke je Sekunde im Eisblock
export const LEVELS = [
  { react: 0.33, think: 0.32, perr: 130, tjit: 0.085, best: 0.5, hes: 0.4, slide: 0.15, sup: 0.3, tap: 4 },
  { react: 0.21, think: 0.20, perr: 55, tjit: 0.045, best: 0.75, hes: 0.15, slide: 0.25, sup: 0.6, tap: 5.5 },
  { react: 0.15, think: 0.14, perr: 28, tjit: 0.025, best: 0.9, hes: 0.05, slide: 0.32, sup: 0.85, tap: 7 },
  { react: 0.08, think: 0.08, perr: 6, tjit: 0.008, best: 1, hes: 0, slide: 0.35, sup: 1, tap: 9 },
];
export const levelOf = n => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, n | 0))];
