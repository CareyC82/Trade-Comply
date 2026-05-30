#!/usr/bin/env bash
# Restart local admin review server (kills stale process on port 8787).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ADMIN_REVIEW_PORT:-8787}"

# Load secrets from project root before the password gate (Node also loads these on boot).
for env_file in "$ROOT/.env.local" "$ROOT/.env"; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    echo "Loaded shell env from $env_file"
    break
  fi
done

if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Stopping existing admin server on port $PORT..."
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill
  sleep 1
fi

if [ -z "${ADMIN_REVIEW_PASSWORD:-}" ]; then
  echo "Set ADMIN_REVIEW_PASSWORD before starting."
  echo "Example: ADMIN_REVIEW_PASSWORD=your-secret npm run dev:admin"
  exit 1
fi

cd "$ROOT"
if [ ! -d node_modules/got-scraping ]; then
  echo "Installing npm deps (got-scraping for GAC TLS fingerprint)..."
  npm ci
fi
if [ -f "$ROOT/.env.local" ]; then
  echo "Will load $ROOT/.env.local (DEEPSEEK_API_KEY, etc.)"
elif [ -f "$ROOT/.env" ]; then
  echo "Will load $ROOT/.env"
elif [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "WARN: DEEPSEEK_API_KEY not set — create .env.local from .env.example for real AI filtering."
fi

echo "Starting admin server (build 20260603-global-compliance-crawler-v1)..."
exec node scripts/admin-server.js
