#!/usr/bin/env bash
# Wrapper untuk operator server — load config.env lalu jalankan pipeline
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$SCRIPT_DIR/config.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/config.env"
  set +a
fi

cd "$REPO_ROOT"
exec node "$SCRIPT_DIR/run-pipeline.mjs" "$@"
