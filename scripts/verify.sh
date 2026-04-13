#!/usr/bin/env bash
set -euo pipefail

# Verification helper for this repository.
# Default mode is quick: lint -> test:ci -> build
# Full mode adds security audit; optional flags can add Android/e2e checks.

MODE="quick"
RUN_INSTALL="false"
RUN_ANDROID="false"
RUN_E2E="false"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/verify.sh [--quick|--full] [--install] [--android] [--e2e]

Modes:
  --quick     Run lint + test:ci + build (default)
  --full      Run quick + security:audit

Options:
  --install   Run npm ci before verification
  --android   Run npm run cap:build:android (requires Android SDK env)
  --e2e       Run npm run test:e2e
  -h, --help  Show this help

Examples:
  scripts/verify.sh
  scripts/verify.sh --full
  scripts/verify.sh --full --android
  scripts/verify.sh --quick --e2e
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_step() {
  local name="$1"
  shift
  log "$name"
  "$@"
}

while (($#)); do
  case "$1" in
    --quick) MODE="quick" ;;
    --full) MODE="full" ;;
    --install) RUN_INSTALL="true" ;;
    --android) RUN_ANDROID="true" ;;
    --e2e) RUN_E2E="true" ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1 (use --help)"
      ;;
  esac
  shift
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd npm

if [[ "$RUN_INSTALL" == "true" ]]; then
  run_step "Install dependencies (npm ci)" npm ci
fi

run_step "PWA cache version sanity check" node scripts/sync-pwa-cache-version.cjs --check
run_step "Lint" npm run lint
run_step "Tests (CI)" npm run test:ci
run_step "Build" npm run build

if [[ "$MODE" == "full" ]]; then
  run_step "Security audit" npm run security:audit
fi

if [[ "$RUN_E2E" == "true" ]]; then
  run_step "E2E tests" npm run test:e2e
fi

if [[ "$RUN_ANDROID" == "true" ]]; then
  if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" && ! -f "$ROOT_DIR/android/local.properties" ]]; then
    fail "Android SDK not configured. Set ANDROID_HOME/ANDROID_SDK_ROOT or android/local.properties first."
  fi
  run_step "Android debug build" npm run cap:build:android
fi

log "Verification completed successfully."
