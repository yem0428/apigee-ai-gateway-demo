#!/usr/bin/env bash
# Test Runner for Apigee Intelligent Auto-Routing Policy
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MODE="${1:---all}"

echo "========================================================="
echo "   Apigee AI Gateway - Auto-Routing Test Suite"
echo "========================================================="

# 1. Fast Offline Unit Tests
echo -e "\n[*] Running Offline Unit Tests (Node.js test runner)..."
node --test "${ROOT_DIR}/ui/tests/autorouting.unit.test.mjs"
echo -e "✅ Offline Unit Tests Passed!\n"

# 2. Optional Live Gateway Tests
if [ "$MODE" == "--live" ] || [ "$MODE" == "--all" ]; then
  if [ -f "${ROOT_DIR}/ui/.env" ]; then
    echo -e "[*] Running Live Gateway Integration Tests against Apigee..."
    (cd "${ROOT_DIR}/ui" && node --env-file=.env --test tests/gateway-live.test.mjs)
    echo -e "✅ Live Gateway Integration Tests Passed!\n"
  else
    echo -e "[i] Skipping live tests (ui/.env not found). Run with --unit to test offline."
  fi
fi

echo "========================================================="
echo "   All Auto-Routing Tests Successfully Completed!"
echo "========================================================="
