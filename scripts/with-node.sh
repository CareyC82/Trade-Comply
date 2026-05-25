#!/usr/bin/env bash
# Run a command with a working Node.js binary on macOS.
# Tries: PATH node -> Homebrew -> Cursor bundled node.

set -euo pipefail

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidates=(
    "/opt/homebrew/bin/node"
    "/usr/local/bin/node"
    "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

NODE_BIN="$(find_node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: Node.js not found." >&2
  echo "Install options:" >&2
  echo "  1) brew install node   (after installing Homebrew)" >&2
  echo "  2) https://nodejs.org/ download the macOS installer" >&2
  exit 127
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
exec "$@"
