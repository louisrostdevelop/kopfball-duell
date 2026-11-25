// Mehrzahl für Russisch und Ukrainisch (ru.js, uk.js): eine Form für 1, eine für 2–4, eine für 5+ (11–14 zählen zu 5+).
/** pl(5, "матч", "матчі", "матчів") -> "5 матчів" (von Hand: Intl fehlt in QuickJS, das die Simulation mitprüft) */
export const pl = (n, one, few, many) => { const v = Math.trunc(Number(String(n).replace(/[^\d.]/g, "")) || 0), d = v % 10, h = v % 100; return `${n} ${d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many}`; };
