#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-}"
if [[ -z "${BASE_REF}" ]]; then
  if [[ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_SHA:-}" ]]; then
    BASE_REF="${CI_MERGE_REQUEST_TARGET_BRANCH_SHA}"
  elif [[ -n "${CI_DEFAULT_BRANCH:-}" ]]; then
    BASE_REF="origin/${CI_DEFAULT_BRANCH}"
  else
    BASE_REF="origin/main"
  fi
fi

if ! git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
  echo "Base-Ref '${BASE_REF}' nicht gefunden. Versuche Fetch..."
  git fetch origin "${CI_DEFAULT_BRANCH:-main}" >/dev/null 2>&1 || true
fi

if ! git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
  echo "WARN: Base-Ref '${BASE_REF}' weiterhin nicht aufloesbar. Check wird uebersprungen."
  exit 0
fi

CHANGED_FILES="$(git diff --name-only "${BASE_REF}"...HEAD || true)"
if [[ -z "${CHANGED_FILES}" ]]; then
  echo "Keine Aenderungen gegen ${BASE_REF} erkannt."
  exit 0
fi

echo "Geaenderte Dateien gegen ${BASE_REF}:"
echo "${CHANGED_FILES}" | sed 's/^/ - /'

REQUIRES_DOC_SYNC=false
if echo "${CHANGED_FILES}" | grep -Eq '^(src/|src-tauri/|package\.json|package-lock\.json|vite\.config\.ts|tsconfig\.json|index\.html)'; then
  REQUIRES_DOC_SYNC=true
fi

if [[ "${REQUIRES_DOC_SYNC}" != "true" ]]; then
  echo "Keine Feature/Fix-relevanten Codeaenderungen erkannt. Doku-Check nicht erforderlich."
  exit 0
fi

README_TOUCHED=false
CHANGELOG_TOUCHED=false

if echo "${CHANGED_FILES}" | grep -qx 'README.md'; then
  README_TOUCHED=true
fi

if echo "${CHANGED_FILES}" | grep -qx 'CHANGELOG.md'; then
  CHANGELOG_TOUCHED=true
fi

if [[ "${README_TOUCHED}" == "true" && "${CHANGELOG_TOUCHED}" == "true" ]]; then
  echo "OK: README.md und CHANGELOG.md wurden aktualisiert."
  exit 0
fi

echo "ERROR: Feature/Fix-Code wurde geaendert, aber README.md und/oder CHANGELOG.md fehlen."
echo "README.md geaendert:    ${README_TOUCHED}"
echo "CHANGELOG.md geaendert: ${CHANGELOG_TOUCHED}"
exit 1

