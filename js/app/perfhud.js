// Mess-Overlay für Entwickler, nur mit ?perf in der Adresse (loop.js lädt es dann nach, sonst nie).
// Zeigt Bildrate, Bildabstand (Mittel, p95, p99), Rechenzeit je Bild aufgeteilt in Simulation (mit Bot) und Zeichnen,
// den Rest (Eingabe, Netz, Effekte, DOM) und den JS-Speicher; Speicherabfälle zählen als Garbage Collection.
// ?perf=flush rechnet das Rastern des Canvas mit (getImageData nach dem Zeichnen erzwingt es), sonst misst „Zeichnen“
// nur das Aufzeichnen der Befehle. Messskripte lesen window.__perf.report() und setzen mit window.__perf.reset() zurück.
const N = 1200;
const ring = () => ({ a: new Float64Array(N), n: 0 });
const push = (r, v) => { r.a[r.n % N] = v; r.n++; };
const vals = r => Array.from(r.a.subarray(0, Math.min(r.n, N)));
const q = (x, p) => (x.length ? x.slice().sort((u, v) => u - v)[Math.min(x.length - 1, Math.floor(x.length * p))] : 0);
const mean = x => (x.length ? x.reduce((u, v) => u + v, 0) / x.length : 0);
const sum = x => ({ mean: mean(x), p95: q(x, 0.95), p99: q(x, 0.99), max: q(x, 1) });

export function startPerf(flush) {
  const R = { gap: ring(), work: ring(), sim: ring(), draw: ring() };
  let last = 0, t0 = 0, ts = 0, sim = 0, draw = 0, heap = 0, gc = 0, gcMB = 0, shown = 0, tick = 0;
  const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  const el = document.createElement("pre");
  el.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:99999;margin:0;padding:4px 6px;font:11px/1.3 monospace;color:#9f9;background:rgba(0,0,0,.7);pointer-events:none;white-space:pre";
  document.body.append(el);
  const api = {
    /** Anfang des Bilds (now: Zeitstempel von requestAnimationFrame) */
    begin(now) { if (last) push(R.gap, now - last); last = now; t0 = performance.now(); sim = 0; draw = 0; },
    simStart() { ts = performance.now(); },
    simEnd() { sim += performance.now() - ts; },
    drawStart() { ts = performance.now(); },
    drawEnd(cv) { if (flush && cv) cv.getContext("2d").getImageData(0, 0, 1, 1); draw += performance.now() - ts; },
    end() {
      const t1 = performance.now();
      push(R.work, t1 - t0); push(R.sim, sim); push(R.draw, draw);
      // Speicher nur jedes 5. Bild lesen (performance.memory kostet selbst spürbar Zeit)
      if (++tick % 5 === 0) { const h = mem(); if (h && heap && h < heap - 256 * 1024) { gc++; gcMB += (heap - h) / 1048576; } heap = h; }
      if (t1 - shown > 500) { shown = t1; el.textContent = text(); }
    },
    reset() { for (const k in R) R[k].n = 0; gc = 0; gcMB = 0; last = 0; },
    report() {
      const o = {}; for (const k in R) o[k] = sum(vals(R[k]));
      return { ...o, frames: Math.min(R.gap.n, N), gc, gcMB, heapMB: mem() / 1048576 };
    },
  };
  const f = v => v.toFixed(1).padStart(5);
  const text = () => {
    const r = api.report(), fps = r.gap.mean ? 1000 / r.gap.mean : 0;
    return `${fps.toFixed(0)} fps  Abstand ${f(r.gap.mean)} p95 ${f(r.gap.p95)} p99 ${f(r.gap.p99)} ms\n` +   // i18n-ok: Entwickler-Overlay
      `Arbeit ${f(r.work.mean)} p95 ${f(r.work.p95)}  Sim ${f(r.sim.mean)}  Zeichnen ${f(r.draw.mean)}${flush ? " (mit Raster)" : ""}\n` +   // i18n-ok: Entwickler-Overlay
      `Heap ${r.heapMB.toFixed(1)} MB  GC ${r.gc}× ${r.gcMB.toFixed(1)} MB`;   // i18n-ok: Entwickler-Overlay
  };
  window.__perf = api;
  return api;
}
