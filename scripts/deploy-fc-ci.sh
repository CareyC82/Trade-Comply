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
  if command -v aliyun >/dev/null 2>&1; then
    echo "Aliyun CLI already installed: $(aliyun version)"
  else
    echo "Installing Aliyun CLI..."
    curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz -o /tmp/aliyun-cli.tgz
    tar -xzf /tmp/aliyun-cli.tgz -C /tmp
    chmod +x /tmp/aliyun
    sudo mv /tmp/aliyun /usr/local/bin/aliyun
    aliyun version
  fi

  if ! aliyun plugin list 2>/dev/null | grep -q 'aliyun-cli-fc'; then
    echo "Installing Aliyun FC plugin (required for fc update-function)..."
    aliyun plugin install --name aliyun-cli-fc
  else
    echo "Aliyun FC plugin already installed."
  fi
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

verify_fc_access() {
  echo "Verifying FC API access for ${FC_FUNCTION_NAME} (${FC_REGION})..."
  if ! aliyun fc get-function \
    --function-name "$FC_FUNCTION_NAME" \
    --region "$FC_REGION" \
    --quiet 2>&1; then
    echo "ERROR: Cannot read function '${FC_FUNCTION_NAME}' in region '${FC_REGION}'." >&2
    echo "Check GitHub secrets (no extra spaces/newlines) and RAM policy on the deploy user:" >&2
    echo "  - AliyunFCFullAccess (recommended), or at least fc:GetFunction + fc:UpdateFunction" >&2
    exit 1
  fi
  echo "FC access OK."
}

deploy_function() {
  if [ ! -f fc-deploy.zip ]; then
    echo "ERROR: fc-deploy.zip not found. Run package-fc.sh first." >&2
    exit 1
  fi

  local zip_b64
  zip_b64="$(base64 -w0 fc-deploy.zip)"
  echo "Prepared code payload ($(wc -c < fc-deploy.zip) bytes zip, ${#zip_b64} base64 chars)."

  local oss_key_id="${OSS_ACCESS_KEY_ID:-$ACCESS_KEY_ID}"
  local oss_key_secret="${OSS_ACCESS_KEY_SECRET:-$ACCESS_KEY_SECRET}"

  echo "Updating FC function code and environment variables..."
  if ! aliyun fc update-function \
    --function-name "$FC_FUNCTION_NAME" \
    --region "$FC_REGION" \
    --code "zipFile=${zip_b64}" \
    --environment-variables \
      "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}" \
      "OSS_BUCKET=${OSS_BUCKET:-}" \
      "OSS_REGION=${OSS_REGION:-cn-shenzhen}" \
      "OSS_ACCESS_KEY_ID=${oss_key_id}" \
      "OSS_ACCESS_KEY_SECRET=${oss_key_secret}" \
      "OSS_FEEDBACK_PREFIX=${OSS_FEEDBACK_PREFIX:-feedback}"; then
    echo "ERROR: fc update-function failed (see Aliyun error above)." >&2
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
