#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ACCESS_KEY_ID="${ALIBABA_CLOUD_ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
ACCESS_KEY_SECRET="${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
FC_FUNCTION_NAME="${FC_FUNCTION_NAME:-tradecoai-agent}"
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
  if command -v aliyun >/dev/null 2>&1; then
    echo "Aliyun CLI already installed: $(aliyun version)"
    return 0
  fi

  echo "Installing Aliyun CLI..."
  curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz -o /tmp/aliyun-cli.tgz
  tar -xzf /tmp/aliyun-cli.tgz -C /tmp
  chmod +x /tmp/aliyun
  sudo mv /tmp/aliyun /usr/local/bin/aliyun
  aliyun version
}

configure_aliyun_cli() {
  aliyun configure set \
    --profile default \
    --mode AK \
    --region "$FC_REGION" \
    --access-key-id "$ACCESS_KEY_ID" \
    --access-key-secret "$ACCESS_KEY_SECRET"
  echo "Aliyun CLI configured for region ${FC_REGION}."
}

write_update_body() {
  node <<'NODE'
const fs = require('fs');
const path = require('path');

const zipPath = path.join(process.cwd(), 'fc-deploy.zip');
if (!fs.existsSync(zipPath)) {
  console.error('ERROR: fc-deploy.zip not found. Run package-fc.sh first.');
  process.exit(1);
}

const body = {
  code: {
    zipFile: fs.readFileSync(zipPath).toString('base64')
  },
  environmentVariables: {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    OSS_BUCKET: process.env.OSS_BUCKET || '',
    OSS_REGION: process.env.OSS_REGION || 'cn-shenzhen',
    OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
    OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
    OSS_FEEDBACK_PREFIX: process.env.OSS_FEEDBACK_PREFIX || 'feedback'
  }
};

fs.writeFileSync('fc-update-body.json', JSON.stringify(body));
console.log(`Prepared fc-update-body.json (${Math.round(fs.statSync('fc-update-body.json').size / 1024)} KB).`);
NODE
}

deploy_function() {
  echo "Updating FC function code and environment variables..."
  aliyun fc PUT "/2023-03-30/functions/${FC_FUNCTION_NAME}" \
    --region "$FC_REGION" \
    --body "file://fc-update-body.json"
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
  deploy)
    write_update_body
    deploy_function
    ;;
  all)
    preflight
    build_package
    install_aliyun_cli
    configure_aliyun_cli
    write_update_body
    deploy_function
    ;;
  *)
    echo "Usage: bash scripts/deploy-fc-ci.sh [preflight|build|install-cli|configure|deploy|all]" >&2
    exit 1
    ;;
esac
