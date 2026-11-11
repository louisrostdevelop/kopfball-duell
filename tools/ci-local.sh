#!/usr/bin/env bash
# Vollständiger Testlauf wie auf GitHub, auf einer frischen Kopie des letzten Commits (vor dem Schritt auf main).
# Browser-Tests: Online nacheinander, Oberfläche gleichzeitig (tools/e2e.mjs). Zweiter Lauf auf einem Kern nur, wenn
# Netzcode oder Spiellogik geändert sind (findet Zeitfehler). Datenbank-Tests und actionlint, wenn vorhanden.
set -u
SRC=$(cd "$(dirname "$0")/.." && pwd); DIR=${KD_CI_DIR:-/var/tmp/kd-ci}; LOG=${KD_CI_LOG:-/var/tmp}
rm -rf "$DIR" && git clone -q "$SRC" "$DIR" && cd "$DIR" || exit 1
fail=0; T0=$(date +%s)
step() { echo "== $1 ($(( $(date +%s) - T0 )) s)"; }
step "npm ci"; npm ci --silent > "$LOG/ci-npm.log" 2>&1 || { fail=1; echo "FEHLER (npm ci)"; tail -5 "$LOG/ci-npm.log"; }
step "npm test"; npm test > "$LOG/ci-unit.log" 2>&1 || { fail=1; echo "FEHLER"; }; grep -E '^# (pass|fail)|^not ok|problem' "$LOG/ci-unit.log" | head
step "Browser"; node tools/e2e.mjs > "$LOG/ci-e2e1.log" 2>&1 || { fail=1; echo "FEHLER"; }; grep -E '^(Alles grün|FEHLER)|✖' "$LOG/ci-e2e1.log" | head -30
if node -e 'import("./tools/test-map.mjs").then(m => process.exit(m.needsStress(m.changedFiles(".", process.env.KD_CI_BASE || "origin/main")) ? 0 : 1))'; then
  step "Browser auf einem Kern (Netzcode geändert)"; KD_E2E_WORKERS=1 taskset -c 0 node tools/e2e.mjs --serial > "$LOG/ci-e2e2.log" 2>&1 || { fail=1; echo "FEHLER"; }; grep -E '^(Alles grün|FEHLER)|✖' "$LOG/ci-e2e2.log" | head -30
else step "Browser auf einem Kern: übersprungen (kein Netzcode geändert)"; fi
if [ -f supabase/local/run-tests.sh ] && [ -n "${PGPORT:-}" ]; then step "Datenbank"; bash supabase/local/run-tests.sh > "$LOG/ci-db.log" 2>&1 || { fail=1; echo "FEHLER"; }; tail -4 "$LOG/ci-db.log"; fi
if command -v actionlint > /dev/null; then step "actionlint"; actionlint || fail=1; fi
step "fertig: $([ $fail = 0 ] && echo 'alles grün' || echo 'FEHLER')"
exit $fail
