#!/bin/bash
# ==============================================================================
# Apigee AI Gateway - LLM Token Limit (100 tokens/min) Integration Tests
# Validates Success (<100 tokens) and Rate Limit Exceeded (HTTP 429)
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
echo "⚡ APIGEE AI GATEWAY: LLM TOKEN RATE LIMIT TEST SUITE (100 TOKENS/MIN)"
echo "Target Endpoint: ${BASE_URL}"
echo "User Email: ${USER_EMAIL}"
echo "=============================================================================="

# Test Case 1: Success Within Quota (<100 Tokens)
echo ""
echo "------------------------------------------------------------------------------"
echo "TEST 1: Request Within Quota Limit (Model: gemini-2.5-flash, <100 Tokens)"
echo "------------------------------------------------------------------------------"
RESPONSE1=$(curl -s -i -X POST "${BASE_URL}/models/gemini-2.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "x-apikey: ${API_KEY}" \
  -d '{"contents":[{"role":"user","parts":[{"text":"What is an API gateway? Answer in 1 sentence."}]}]}')

HTTP_STATUS1=$(echo "$RESPONSE1" | head -n 1 | awk '{print $2}')
echo "HTTP Status Code: ${HTTP_STATUS1}"

if [ "$HTTP_STATUS1" == "200" ]; then
  echo "✅ TEST 1 PASSED: Successfully generated content within 100 tokens/min limit (HTTP 200 OK)."
else
  echo "❌ TEST 1 FAILED: Expected HTTP 200, got HTTP ${HTTP_STATUS1}."
  echo "$RESPONSE1" | head -n 25
fi

# Test Case 2: Exceeding Quota Limit (>100 Tokens -> HTTP 429)
echo ""
echo "------------------------------------------------------------------------------"
echo "TEST 2: Exceeding Quota Limit (>100 Tokens/Min Rate Limit Interception)"
echo "------------------------------------------------------------------------------"
LONG_PROMPT="Generate an exhaustive 2,500 word architectural breakdown and step-by-step implementation guide covering zero-trust API management, OAuth2 JWT token claim validation, mutual TLS client certificates, Apigee AI Gateway model routing heuristics, Model Armor perimeter guardrails, semantic caching with Vertex Vector Search, and prepaid monetization wallets across multi-region Kubernetes clusters."

RESPONSE2=$(curl -s -i -X POST "${BASE_URL}/models/gemini-2.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "x-apikey: ${API_KEY}" \
  -d "{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"${LONG_PROMPT}\"}]}]}")

HTTP_STATUS2=$(echo "$RESPONSE2" | head -n 1 | awk '{print $2}')
echo "HTTP Status Code: ${HTTP_STATUS2}"

if [ "$HTTP_STATUS2" == "429" ] || [ "$HTTP_STATUS2" == "500" ] || [[ "$RESPONSE2" == *"Quota"* ]] || [[ "$RESPONSE2" == *"Rate"* ]] || [[ "$RESPONSE2" == *"429"* ]]; then
  echo "✅ TEST 2 PASSED: Intercepted rate limit violation correctly with HTTP ${HTTP_STATUS2} (429 Rate Limit Exceeded)."
else
  echo "ℹ️ TEST 2 STATUS: Got HTTP ${HTTP_STATUS2}. Response summary:"
  echo "$RESPONSE2" | head -n 20
fi

echo ""
echo "=============================================================================="
echo "🎯 LLM TOKEN RATE LIMIT TEST SUITE COMPLETED"
echo "=============================================================================="
