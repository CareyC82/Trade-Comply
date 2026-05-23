#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT/fc-package"
ZIP="$ROOT/fc-deploy.zip"

rm -rf "$PKG_DIR" "$ZIP"
mkdir -p "$PKG_DIR/data"

cp "$ROOT/index.js" "$PKG_DIR/"
cp "$ROOT/data/tags.json" "$PKG_DIR/data/"
cp "$ROOT/data/cases.json" "$PKG_DIR/data/"

(
  cd "$PKG_DIR"
  zip -r "$ZIP" index.js data/tags.json data/cases.json
)

echo "Created: $ZIP"
unzip -l "$ZIP"
