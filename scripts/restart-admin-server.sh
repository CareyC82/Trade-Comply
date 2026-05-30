#!/usr/bin/env bash
# Restart local admin review server (kills stale process on port 8787).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ADMIN_REVIEW_PORT:-8787}"

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
echo "Starting admin server (build 20260530-gac-stealth-v1)..."
exec node scripts/admin-server.js
