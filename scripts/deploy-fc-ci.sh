#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ACCESS_KEY_ID="${ALIBABA_CLOUD_ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
ACCESS_KEY_SECRET="${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
ACCOUNT_ID="${ALIBABA_CLOUD_ACCOUNT_ID:-}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"

missing=()
if [ -z "$ACCESS_KEY_ID" ]; then missing+=("ALIBABA_CLOUD_ACCESS_KEY_ID or OSS_ACCESS_KEY_ID"); fi
if [ -z "$ACCESS_KEY_SECRET" ]; then missing+=("ALIBABA_CLOUD_ACCESS_KEY_SECRET or OSS_ACCESS_KEY_SECRET"); fi
if [ -z "$DEEPSEEK_API_KEY" ]; then missing+=("DEEPSEEK_API_KEY"); fi

if [ "${#missing[@]}" -gt 0 ]; then
  echo "ERROR: Missing required GitHub secrets:" >&2
  for item in "${missing[@]}"; do
    echo "  - $item" >&2
  done
  exit 1
fi

echo "Building FC package..."
bash "$ROOT/scripts/package-fc.sh"

echo "Installing Serverless Devs..."
npm install -g @serverless-devs/s@3
s -v

mkdir -p "$HOME/.s"
ACCESS_FILE="$HOME/.s/access.yaml"

{
  echo "default:"
  echo "  AccessKeyID: ${ACCESS_KEY_ID}"
  echo "  AccessKeySecret: ${ACCESS_KEY_SECRET}"
  if [ -n "$ACCOUNT_ID" ]; then
    echo "  AccountID: '${ACCOUNT_ID}'"
  fi
} > "$ACCESS_FILE"

echo "Configured Serverless Devs access profile: default"
if [ -n "$ACCOUNT_ID" ]; then
  echo "AccountID: ${ACCOUNT_ID}"
else
  echo "WARN: ALIBABA_CLOUD_ACCOUNT_ID not set; deploy may fail for FC3."
fi

export DEEPSEEK_API_KEY
export OSS_BUCKET="${OSS_BUCKET:-}"
export OSS_REGION="${OSS_REGION:-cn-shenzhen}"
export OSS_ACCESS_KEY_ID="${OSS_ACCESS_KEY_ID:-$ACCESS_KEY_ID}"
export OSS_ACCESS_KEY_SECRET="${OSS_ACCESS_KEY_SECRET:-$ACCESS_KEY_SECRET}"
export OSS_FEEDBACK_PREFIX="${OSS_FEEDBACK_PREFIX:-feedback}"

echo "Deploying tradecoai-agent to cn-shenzhen..."
s deploy -y --debug

echo "FC deploy completed."
