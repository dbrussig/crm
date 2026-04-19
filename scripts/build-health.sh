#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-health.sh – Reproduzierbarer Build / Typecheck / Devserver Check
# Exit 0 = alle Checks bestanden, Exit 1 = mindestens ein Check fehlgeschlagen
# ──────────────────────────────────────────────────────────────
set -uo pipefail

# ── Config ────────────────────────────────────────────────────
DEV_PORT=5173
DEV_WAIT_SECONDS=6
HTTP_TIMEOUT=5
COLOR_OK='\033[0;32m'
COLOR_FAIL='\033[0;31m'
COLOR_DIM='\033[2m'
COLOR_BOLD='\033[1m'
COLOR_RESET='\033[0m'

# ── State ─────────────────────────────────────────────────────
FAILED=0
DEV_PID=""
TIMING_FILE=""

# ── Helpers ───────────────────────────────────────────────────
timestamp()   { date +%s; }
elapsed()     { local s=$(($2 - $1)); printf "%ds" "$s"; }

section() {
  echo ""
  echo -e "${COLOR_BOLD}── $1 ──────────────────────────────────────${COLOR_RESET}"
}

ok() {
  echo -e "  ${COLOR_OK}✔ OK${COLOR_RESET} ($1)"
}

fail() {
  echo -e "  ${COLOR_FAIL}✘ FEHLGESCHLAGEN${COLOR_RESET} ($1)"
  FAILED=1
}

# ── Cleanup trap ──────────────────────────────────────────────
cleanup() {
  if [[ -n "$DEV_PID" ]]; then
    # Kill the dev server and its children (node/vite subprocess tree)
    pkill -P "$DEV_PID" 2>/dev/null || true
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
    DEV_PID=""
  fi
  # Clean up temp timing file if we created one
  [[ -n "${TIMING_FILE:-}" && -f "$TIMING_FILE" ]] && rm -f "$TIMING_FILE"
}
trap cleanup EXIT

# ── Step 1: Build ─────────────────────────────────────────────
section "1/3  npm run build"
START=$(timestamp)
if npm run build 2>&1 | sed 's/^/  /'; then
  END=$(timestamp)
  ok "$(elapsed "$START" "$END")"
else
  END=$(timestamp)
  fail "$(elapsed "$START" "$END")"
fi

# ── Step 2: Typecheck ────────────────────────────────────────
section "2/3  npm run typecheck"
START=$(timestamp)
if npm run typecheck 2>&1 | sed 's/^/  /'; then
  END=$(timestamp)
  ok "$(elapsed "$START" "$END")"
else
  END=$(timestamp)
  fail "$(elapsed "$START" "$END")"
fi

# ── Step 3: Devserver Smoke-Test ──────────────────────────────
section "3/3  Devserver Smoke-Test (localhost:${DEV_PORT})"

# Start dev server in background, redirect output so it doesn't clutter summary
DEV_LOG=$(mktemp "${TMPDIR:-/tmp}/build-health-dev.XXXXXX")
TIMING_FILE="$DEV_LOG"

# Start dev server in background
# On macOS setsid is not available, so we start normally and kill the process tree via pkill
npm run dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!

echo -e "  ${COLOR_DIM}Devserver gestartet (PID $DEV_PID), warte ${DEV_WAIT_SECONDS}s …${COLOR_RESET}"

# Wait for server to come up
sleep "$DEV_WAIT_SECONDS"

# HTTP request – try curl first, fall back to wget
HTTP_CODE=""
if command -v curl &>/dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$HTTP_TIMEOUT" "http://localhost:${DEV_PORT}/" 2>/dev/null || true)
elif command -v wget &>/dev/null; then
  # wget: --spider gives us the HTTP status code
  HTTP_CODE=$(wget --spider -S "http://localhost:${DEV_PORT}/" 2>&1 | grep -oP 'HTTP/\d\.\d \K\d+' | tail -1 || true)
fi

# Kill dev server immediately – we don't need it anymore
pkill -P "$DEV_PID" 2>/dev/null || true
kill "$DEV_PID" 2>/dev/null || true
wait "$DEV_PID" 2>/dev/null || true
DEV_PID=""

if [[ "$HTTP_CODE" == "200" ]]; then
  ok "HTTP $HTTP_CODE von localhost:${DEV_PORT}"
else
  echo -e "  ${COLOR_DIM}Letzte Devserver-Ausgabe:${COLOR_RESET}"
  tail -20 "$DEV_LOG" 2>/dev/null | sed 's/^/    /'
  echo ""
  if [[ -z "$HTTP_CODE" ]]; then
    fail "Keine HTTP-Antwort (curl/wget nicht verfügbar oder Server nicht gestartet)"
  else
    fail "HTTP $HTTP_CODE (erwartet: 200)"
  fi
fi

rm -f "$DEV_LOG"
TIMING_FILE=""

# ── Summary ───────────────────────────────────────────────────
section "Zusammenfassung"
if [[ "$FAILED" -eq 0 ]]; then
  echo -e "  ${COLOR_OK}${COLOR_BOLD}Alle Checks bestanden ✔${COLOR_RESET}"
  echo ""
  exit 0
else
  echo -e "  ${COLOR_FAIL}${COLOR_BOLD}Mindestens ein Check fehlgeschlagen ✘${COLOR_RESET}"
  echo ""
  exit 1
fi
