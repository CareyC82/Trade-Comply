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
cp "$ROOT"/lib/*.js "$PKG_DIR/lib/"
cp "$ROOT/data/policy-sources.json" "$PKG_DIR/data/"
cp "$ROOT/data/country-registry.json" "$PKG_DIR/data/"
cp "$ROOT/data/coverage-matrix.json" "$PKG_DIR/data/"
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
    lib/*.js \
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
    data/country-registry.json \
    data/coverage-matrix.json
)

ZIP_LIST="$(unzip -l "$ZIP")"
for required in compliance-feedback-codec.js lib/fc-deps.js lib/global-crawl-engine.js lib/global-compliance-crawler.js lib/admin-route-security.js lib/pre-screen-report.js lib/policy-crawl.js lib/hscode-dual.js lib/industry-checklist-baseline.js lib/checklist.js lib/country-registry.js data/country-registry.json data/coverage-matrix.json data/policy-sources.json; do
  if ! printf '%s\n' "$ZIP_LIST" | grep -Fq "$required"; then
    echo "ERROR: fc-deploy.zip is missing $required" >&2
    exit 1
  fi
done

echo "Running FC package smoke test..."
(
  cd "$PKG_DIR"
  node -e "require('./index.js')"
)

echo "Created: $ZIP"
unzip -l "$ZIP"
