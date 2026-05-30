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
mkdir -p "$PKG_DIR/data" "$PKG_DIR/js" "$PKG_DIR/lib"

cp "$ROOT/index.js" "$PKG_DIR/"
cp "$ROOT/lib/parse-model-json.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/country-registry.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/hscode-dual.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/industry-checklist-baseline.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/checklist.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/fc-deps.js" "$PKG_DIR/lib/"
cp "$ROOT/lib/policy-crawl.js" "$PKG_DIR/lib/"
cp "$ROOT/data/policy-sources.json" "$PKG_DIR/data/"
cp "$ROOT/data/country-registry.json" "$PKG_DIR/data/"
cp "$ROOT/compliance-feedback-codec.js" "$PKG_DIR/"
cp "$ROOT/feedback-store.js" "$PKG_DIR/"
cp "$ROOT/supabase-feedback.js" "$PKG_DIR/"
cp "$ROOT/js/catalog.js" "$PKG_DIR/js/"
cp "$ROOT/data/tags.json" "$PKG_DIR/data/"
cp "$ROOT/data/cases.json" "$PKG_DIR/data/"
cp "$ROOT/data/categories.json" "$PKG_DIR/data/"
cp "$ROOT/data/catalog.schema.json" "$PKG_DIR/data/"
cp "$ROOT/data/scope-keywords.json" "$PKG_DIR/data/"
cp "$ROOT/data/catalog.json" "$PKG_DIR/data/"

(
  cd "$PKG_DIR"
  zip -r "$ZIP" \
    index.js \
    lib/parse-model-json.js \
    lib/country-registry.js \
    lib/hscode-dual.js \
    lib/industry-checklist-baseline.js \
    lib/checklist.js \
    lib/fc-deps.js \
    lib/policy-crawl.js \
    data/policy-sources.json \
    compliance-feedback-codec.js \
    feedback-store.js \
    supabase-feedback.js \
    js/catalog.js \
    data/tags.json \
    data/cases.json \
    data/categories.json \
    data/catalog.schema.json \
    data/scope-keywords.json \
    data/catalog.json \
    data/country-registry.json
)

ZIP_LIST="$(unzip -l "$ZIP")"
for required in compliance-feedback-codec.js lib/fc-deps.js lib/policy-crawl.js lib/hscode-dual.js lib/industry-checklist-baseline.js lib/checklist.js lib/country-registry.js data/country-registry.json data/policy-sources.json; do
  if ! printf '%s\n' "$ZIP_LIST" | grep -Fq "$required"; then
    echo "ERROR: fc-deploy.zip is missing $required" >&2
    exit 1
  fi
done

echo "Created: $ZIP"
unzip -l "$ZIP"
