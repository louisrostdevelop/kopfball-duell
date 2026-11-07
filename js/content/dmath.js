// Deterministische Mathematik für die Physik: auf jedem Gerät und in jedem Browser bit-genau gleich.
// Grundrechenarten und Math.sqrt rechnet JavaScript nach IEEE 754 exakt gerundet (vom Standard vorgeschrieben,
// ohne zusammengezogene Multiplikation/Addition). Math.sin, cos, atan2, exp, pow, tanh, hypot dagegen sind nur
// „näherungsweise“ festgelegt und unterscheiden sich zwischen Engines (V8, JavaScriptCore, SpiderMonkey) in der
// letzten Stelle. Für Online-Spiele mit Rollback müssen beide Geräte exakt gleich rechnen, deshalb hier eigene
// Umsetzungen nur aus +, -, *, / und sqrt. Genauigkeit etwa 1e-15 relativ, für ein Spiel mehr als genug.
// Zufall: im Spielzustand (st.rng), siehe rnd()/rrange(). Liegt in content/, damit auch layouts.js es nutzen darf.

const PI = 3.141592653589793, HALF_PI = 1.5707963267948966;
// π/2 in zwei Teilen (Cody-Waite): HI hat nur 33 signifikante Bits, k*HI ist für |k| < 2^20 exakt
const PIO2_HI = 1.5707963267341256, PIO2_LO = 6.077100506506192e-11;
const LN2_HI = 0.6931471803691238, LN2_LO = 1.9082149292705877e-10, INV_LN2 = 1.4426950408889634;

/** Runden zur nächsten ganzen Zahl (Hälften weg von 0), deterministisch */
const rint = x => (x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5));

// Polynome auf [-π/4, π/4] (Taylor bis x^17 bzw. x^16, Restfehler < 1e-17)
function sinP(r) {
  const z = r * r;
  return r * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000 + z / 355687428096000))))))));
}
function cosP(r) {
  const z = r * r;
  return 1 + z * (-0.5 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z / 20922789888000)))))));
}
/** Quadrant k und Rest r mit x = k·π/2 + r, |r| ≤ π/4 (für |x| bis ~1e6 genau) */
function reduce(x) {
  const k = rint(x / HALF_PI);
  return [k, (x - k * PIO2_HI) - k * PIO2_LO];
}

export function dsin(x) {
  if (!Number.isFinite(x)) return NaN;
  const [k, r] = reduce(x), q = ((k % 4) + 4) % 4;
  return q === 0 ? sinP(r) : q === 1 ? cosP(r) : q === 2 ? -sinP(r) : -cosP(r);
}
export function dcos(x) {
  if (!Number.isFinite(x)) return NaN;
  const [k, r] = reduce(x), q = ((k % 4) + 4) % 4;
  return q === 0 ? cosP(r) : q === 1 ? -sinP(r) : q === 2 ? -cosP(r) : sinP(r);
}

/** atan für |x| ≤ 1: zweimal halbieren (atan x = 2·atan(x/(1+√(1+x²)))), dann Reihe */
function atanSmall(x) {
  let y = x;
  y = y / (1 + Math.sqrt(1 + y * y));
  y = y / (1 + Math.sqrt(1 + y * y));
  // jetzt |y| ≤ tan(π/16) ≈ 0.199: Reihe bis y^29 (Rest < 1e-21)
  const z = y * y;
  let s = 0;
  for (let n = 29; n >= 3; n -= 2) s = z * ((n % 4 === 1 ? 1 : -1) / n + s);
  return 4 * (y + y * s);
}
export function datan(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 1) return HALF_PI - atanSmall(1 / x);
  if (x < -1) return -HALF_PI - atanSmall(1 / x);
  return atanSmall(x);
}
export function datan2(y, x) {
  if (Number.isNaN(y) || Number.isNaN(x)) return NaN;
  if (x === 0) return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : (1 / x < 0 ? (1 / y < 0 ? -PI : PI) : y);
  const a = datan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + PI : a - PI;
}

export function dexp(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = rint(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;   // |r| ≤ ln2/2
  // Taylor bis r^14 (Rest < 1e-17)
  let s = 1;
  for (let n = 14; n >= 1; n--) s = 1 + (r / n) * s;
  return scale2(s, k);
}
/** s·2^k exakt (Multiplikation mit Zweierpotenzen ist exakt, solange nichts überläuft) */
function scale2(s, k) {
  let v = s;
  while (k > 0) { const st = k > 60 ? 60 : k; v *= TWO[st]; k -= st; }
  while (k < 0) { const st = k < -60 ? 60 : -k; v /= TWO[st]; k += st; }
  return v;
}
const TWO = (() => { const t = [1]; for (let i = 1; i <= 60; i++) t.push(t[i - 1] * 2); return t; })();

export function dtanh(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 20) return 1;
  if (x < -20) return -1;
  const e = dexp(2 * x);
  return (e - 1) / (e + 1);
}

/** √(x²+y²): mit sqrt exakt gerundet; Überlauf spielt bei Spielgrößen keine Rolle */
export const dhypot = (x, y) => Math.sqrt(x * x + y * y);

// ---------- Zufall im Spielzustand (mulberry32, nur Ganzzahl-Operationen) ----------
/** neuer Startwert aus dem Gerätezufall (nur außerhalb der Physik benutzen) */
export const newSeed = () => (Math.random() * 4294967296) >>> 0;   // det-ok: nur beim Anlegen, der Wert reist im Zustand
/** Zahl in [0, 1) aus st.rng; schreibt den Zustand fort */
export function rnd(st) {
  let t = (st.rng = (st.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rrange = (st, a, b) => a + rnd(st) * (b - a);
