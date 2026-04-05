#!/usr/bin/env bash
set -euo pipefail

: "${TAURI_UPDATER_PUBLIC_KEY:?Missing CI var TAURI_UPDATER_PUBLIC_KEY}"
: "${TAURI_SIGNING_PRIVATE_KEY:?Missing CI var TAURI_SIGNING_PRIVATE_KEY}"

node -e "const fs=require('fs');
const p='src-tauri/tauri.conf.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
c.plugins=c.plugins||{};
c.plugins.updater=c.plugins.updater||{};
c.plugins.updater.pubkey=process.env.TAURI_UPDATER_PUBLIC_KEY;
fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');
console.log('Updated tauri.conf.json updater pubkey from CI variable.');"

npm run tauri:build

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
MACOS_BUNDLE_DIR="src-tauri/target/release/bundle/macos"
DMG_BUNDLE_DIR="src-tauri/target/release/bundle/dmg"
APP_BUNDLE="$(ls -1 "$MACOS_BUNDLE_DIR"/*.app | head -n 1)"
APP_ARCHIVE="${APP_BUNDLE%.app}.app.tar.gz"
tar -C "$(dirname "$APP_BUNDLE")" -czf "$APP_ARCHIVE" "$(basename "$APP_BUNDLE")"
npx tauri signer sign "$APP_ARCHIVE"
APP_SIG="${APP_ARCHIVE}.sig"
DMG_FILE="$(ls -1 "$DMG_BUNDLE_DIR"/*.dmg | head -n 1 || true)"

test -f "$APP_ARCHIVE"
test -f "$APP_SIG"

PACKAGE_BASE="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/mietpark-crm-desktop/latest"
ARCHIVE_NAME="$(basename "$APP_ARCHIVE")"
SIG_NAME="$(basename "$APP_SIG")"
ARCHIVE_NAME_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$ARCHIVE_NAME")"
SIG_NAME_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SIG_NAME")"

if echo "$ARCHIVE_NAME" | grep -qi "aarch64"; then
  TARGET_KEY="darwin-aarch64"
else
  TARGET_KEY="darwin-x86_64"
fi

SIG_CONTENT="$(tr -d '\n' < "$APP_SIG")"
ARCHIVE_URL="${PACKAGE_BASE}/${ARCHIVE_NAME_ENC}"

cat > latest.json <<JSON
{
  "version": "${VERSION}",
  "notes": "Automatisches Update aus main (${CI_COMMIT_SHORT_SHA})",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "${TARGET_KEY}": {
      "signature": "${SIG_CONTENT}",
      "url": "${ARCHIVE_URL}"
    }
  }
}
JSON

curl --fail --header "JOB-TOKEN: ${CI_JOB_TOKEN}" --upload-file "$APP_ARCHIVE" "${PACKAGE_BASE}/${ARCHIVE_NAME_ENC}"
curl --fail --header "JOB-TOKEN: ${CI_JOB_TOKEN}" --upload-file "$APP_SIG" "${PACKAGE_BASE}/${SIG_NAME_ENC}"
curl --fail --header "JOB-TOKEN: ${CI_JOB_TOKEN}" --upload-file latest.json "${PACKAGE_BASE}/latest.json"

if [ -n "${DMG_FILE}" ] && [ -f "${DMG_FILE}" ]; then
  curl --fail --header "JOB-TOKEN: ${CI_JOB_TOKEN}" --upload-file "${DMG_FILE}" "${PACKAGE_BASE}/$(basename "${DMG_FILE}")"
fi
