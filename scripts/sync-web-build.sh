#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="$ROOT_DIR/mietpark-crm"
TARGET_DIR="$ROOT_DIR/mietpark-crm-mac/MietparkCRM/Resources/WebApp"

if [[ ! -d "$WEB_DIR" ]]; then
  echo "Web-Projekt nicht gefunden: $WEB_DIR" >&2
  exit 1
fi

cd "$WEB_DIR"
npm run build

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$WEB_DIR/dist/." "$TARGET_DIR/"

echo "Web-Build nach $TARGET_DIR synchronisiert."
