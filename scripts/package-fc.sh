#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT/fc-package"
ZIP="$ROOT/fc-deploy.zip"

if [[ ! -f "$ROOT/data/catalog.json" ]]; then
  echo "data/catalog.json missing; building catalog artifact..."
  node "$ROOT/scripts/build-catalog.js"
fi

rm -rf "$PKG_DIR" "$ZIP"
mkdir -p "$PKG_DIR/data" "$PKG_DIR/js"

cp "$ROOT/index.js" "$PKG_DIR/"
cp "$ROOT/feedback-store.js" "$PKG_DIR/"
cp "$ROOT/js/catalog.js" "$PKG_DIR/js/"
cp "$ROOT/data/tags.json" "$PKG_DIR/data/"
cp "$ROOT/data/cases.json" "$PKG_DIR/data/"
cp "$ROOT/data/categories.json" "$PKG_DIR/data/"
cp "$ROOT/data/catalog.schema.json" "$PKG_DIR/data/"
cp "$ROOT/data/scope-keywords.json" "$PKG_DIR/data/"
cp "$ROOT/data/catalog.json" "$PKG_DIR/data/"

(
  cd "$PKG_DIR"
  zip -r "$ZIP" index.js feedback-store.js js/catalog.js data/tags.json data/cases.json data/categories.json data/catalog.schema.json data/scope-keywords.json data/catalog.json
)

echo "Created: $ZIP"
unzip -l "$ZIP"
