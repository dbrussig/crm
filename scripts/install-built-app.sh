#!/usr/bin/env bash
set -euo pipefail

SRC_APP="src-tauri/target/release/bundle/macos/CRM Buddy Desktop.app"
DST_APP="/Applications/CRM Buddy Desktop.app"

if [ ! -d "$SRC_APP" ]; then
  echo "Build-App nicht gefunden: $SRC_APP"
  echo "Bitte zuerst 'npm run tauri:build' ausführen."
  exit 1
fi

rm -rf "$DST_APP"
ditto "$SRC_APP" "$DST_APP"

find "$DST_APP" -name "._*" -delete
xattr -cr "$DST_APP"
codesign --force --deep --sign - "$DST_APP"

echo "Installiert: $DST_APP"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$DST_APP/Contents/Info.plist" | sed 's/^/Version: /'
