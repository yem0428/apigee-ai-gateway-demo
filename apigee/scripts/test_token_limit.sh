#!/bin/bash
# ==============================================================================
# Apigee AI Gateway - LLM Token Limit (50 tokens/min) Integration Tests
# Validates Success (first call of the minute) and Rate Limit Exceeded (HTTP 429)
# ==============================================================================

SET_X=false
if [ "$1" == "-v" ]; then
  SET_X=true
  set -x
fi

BASE_URL="${BASE_URL:-https://api.maloosatyam.demo.altostrat.com/ai/v1}"
USER_EMAIL="${USER_EMAIL:-maloosatyam@google.com}"
# The proxy resolves identity from a JWT email claim only; the X-User-Email
# fallback was removed. DecodeJWT never verifies the signature, but it does
# reject `alg: none` with an empty signature -- so use RS256 with a placeholder,
# matching apigee/scripts/generate_demo_traffic.py.
b64url() { printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '=\n'; }
USER_JWT="$(b64url '{"alg":"RS256","typ":"JWT"}').$(b64url "{\"email\":\"${USER_EMAIL}\",\"sub\":\"${USER_EMAIL}\"}").$(b64url 'dummysignature12345678901234567890')"

# Never hardcode a consumer key here - this file is version controlled.
# Export one before running, e.g.
#   export API_KEY=$(gcloud ... apps/<app> | jq -r '.credentials[0].consumerKey')
API_KEY="${API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "ERROR: API_KEY is not set." >&2
  echo "       export API_KEY=<consumer key> before running this script." >&2
  exit 1
fi

echo "=============================================================================="
echo "⚡ AI GATEWAY: LLM TOKEN RATE LIMIT TEST SUITE (claude-haiku-4-5, 50 tokens/min)"
echo "Target Endpoint: ${BASE_URL}"
echo "User Email: ${USER_EMAIL}"
echo "=============================================================================="

# Test Case 1: Success on the first call of a fresh 50-token window
echo ""
echo "------------------------------------------------------------------------------"
echo "TEST 1: First call of the minute (Model: claude-haiku-4-5@20251001)"
echo "------------------------------------------------------------------------------"
# The quota is EnforceOnly on the request path, so an empty counter always admits call 1 --
# the block can only land on call 2, and only if call 1 alone overfills the 50-token window.
# "What is an API gateway? Answer in 1 sentence." draws only ~57 tokens, which clears 50 by
# just 14% and is the kind of margin that silently evaporates when the model answers tersely.
# Use the same prompt as TOKEN_LIMIT_EXAMPLES step 1 in the UI, measured at 117 tokens --
# well over 2x the cap, so call 2 is reliably blocked.
TEST1_PROMPT="Explain API gateway rate limiting, spike arrest, and OAuth2 security principles in 50 concise words."

RESPONSE1=$(curl -s -i -X POST "${BASE_URL}/models/claude-haiku-4-5@20251001:generateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "x-apikey: ${API_KEY}" \
  -d "{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"${TEST1_PROMPT}\"}]}]}")

HTTP_STATUS1=$(echo "$RESPONSE1" | head -n 1 | awk '{print $2}')
echo "HTTP Status Code: ${HTTP_STATUS1}"

if [ "$HTTP_STATUS1" == "200" ]; then
  echo "✅ TEST 1 PASSED: Successfully generated content within 50 tokens/min limit (HTTP 200 OK)."
else
  echo "❌ TEST 1 FAILED: Expected HTTP 200, got HTTP ${HTTP_STATUS1}."
  echo "$RESPONSE1" | head -n 25
fi

# Test Case 2: Exceeding Quota Limit (window already over 50 tokens -> HTTP 429)
echo ""
echo "------------------------------------------------------------------------------"
echo "TEST 2: Second call in the same minute (window already consumed -> expect 429)"
echo "------------------------------------------------------------------------------"
LONG_PROMPT="Generate an exhaustive 2,500 word architectural breakdown and step-by-step implementation guide covering zero-trust API management, OAuth2 JWT token claim validation, mutual TLS client certificates, Apigee AI Gateway model routing heuristics, Model Armor perimeter guardrails, semantic caching with Vertex Vector Search, and prepaid monetization wallets across multi-region Kubernetes clusters."

RESPONSE2=$(curl -s -i -X POST "${BASE_URL}/models/claude-haiku-4-5@20251001:generateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "x-apikey: ${API_KEY}" \
  -d "{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"${LONG_PROMPT}\"}]}]}")

HTTP_STATUS2=$(echo "$RESPONSE2" | head -n 1 | awk '{print $2}')
echo "HTTP Status Code: ${HTTP_STATUS2}"

# Assert on the status line only. The previous condition also accepted HTTP 500, and
# substring-matched "Rate"/"429"/"Quota" anywhere in the payload -- but the prompt itself is
# about rate limiting, so a perfectly successful 200 whose generated text said "rate limiting"
# would have been reported as a passing quota block.
if [ "$HTTP_STATUS2" == "429" ]; then
  echo "✅ TEST 2 PASSED: Quota enforced (HTTP 429)."
else
  echo "❌ TEST 2 FAILED: Expected HTTP 429, got HTTP ${HTTP_STATUS2}."
  echo "$RESPONSE2" | head -n 20
fi

echo ""
echo "=============================================================================="
echo "🎯 LLM TOKEN RATE LIMIT TEST SUITE COMPLETED"
echo "=============================================================================="
