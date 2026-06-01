#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

trim_secret() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "$value"
}

ACCESS_KEY_ID="$(trim_secret "${ALIBABA_CLOUD_ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}")"
ACCESS_KEY_SECRET="$(trim_secret "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}")"
DEEPSEEK_API_KEY="$(trim_secret "${DEEPSEEK_API_KEY:-}")"
FC_FUNCTION_NAME="${FC_FUNCTION_NAME:-tradecomply_ai_agent}"
FC_REGION="${FC_REGION:-cn-shenzhen}"

preflight() {
  local missing=()
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

  echo "Preflight OK."
  echo "Function: ${FC_FUNCTION_NAME}"
  echo "Region: ${FC_REGION}"
}

build_package() {
  echo "Building FC package..."
  bash "$ROOT/scripts/package-fc.sh"
}

install_aliyun_cli() {
  if command -v s >/dev/null 2>&1; then
    echo "Serverless Devs already installed: $(s -v)"
  else
    echo "Installing Serverless Devs CLI..."
    npm install -g @serverless-devs/s
    s -v
  fi
}

configure_aliyun_cli() {
  s config add \
    -a default \
    --AccessKeyID "$ACCESS_KEY_ID" \
    --AccessKeySecret "$ACCESS_KEY_SECRET" \
    -f
  echo "Serverless Devs configured with default Alibaba Cloud access."
}

verify_fc_access() {
  echo "Verifying Serverless Devs project access for ${FC_FUNCTION_NAME} (${FC_REGION})..."
  if ! s info -y; then
    echo "ERROR: Cannot read Serverless Devs project info." >&2
    echo "Check GitHub secrets and RAM policy on the deploy user:" >&2
    echo "  - AliyunFCFullAccess (recommended), or equivalent FC read/update permissions" >&2
    exit 1
  fi
  echo "Serverless Devs access OK."
}

deploy_function() {
  if [ ! -d fc-package ]; then
    echo "ERROR: fc-package not found. Run package-fc.sh first." >&2
    exit 1
  fi

  echo "Deploying FC function with Serverless Devs..."
  if ! s deploy -y; then
    echo "ERROR: Serverless Devs deploy failed (see error above)." >&2
    exit 1
  fi

  echo "FC deploy completed."
}

case "${1:-all}" in
  preflight)
    preflight
    ;;
  build)
    build_package
    ;;
  install-cli)
    install_aliyun_cli
    ;;
  configure)
    configure_aliyun_cli
    ;;
  verify)
    verify_fc_access
    ;;
  deploy)
    verify_fc_access
    deploy_function
    ;;
  all)
    preflight
    build_package
    install_aliyun_cli
    configure_aliyun_cli
    deploy_function
    ;;
  *)
    echo "Usage: bash scripts/deploy-fc-ci.sh [preflight|build|install-cli|configure|deploy|all]" >&2
    exit 1
    ;;
esac
