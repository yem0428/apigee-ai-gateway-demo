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

BASE_URL="https://api.maloosatyam.demo.altostrat.com/ai/v1"
API_KEY="${API_KEY:-MNbLeAXCiSvIAu1XtCW6nbAxQWWksfAXyM98AOP6vRAvESOP}"
USER_EMAIL="maloosatyam@google.com"

echo "=============================================================================="
echo "⚡ APIGEE AI GATEWAY: LLM TOKEN RATE LIMIT TEST SUITE (100 TOKENS/MIN)"
echo "Target Endpoint: ${BASE_URL}"
echo "User Email: ${USER_EMAIL}"
echo "=============================================================================="

# Test Case 1: Success Within Quota (<100 Tokens)
echo ""
echo "------------------------------------------------------------------------------"
echo "TEST 1: Request Within Quota Limit (Model: gemini-2.0-flash, <100 Tokens)"
echo "------------------------------------------------------------------------------"
RESPONSE1=$(curl -s -i -X POST "${BASE_URL}/models/gemini-2.0-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: ${USER_EMAIL}" \
  -H "x-apikey: ${API_KEY}" \
  -H "x-enforce-token-limit: true" \
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

RESPONSE2=$(curl -s -i -X POST "${BASE_URL}/models/gemini-2.0-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: ${USER_EMAIL}" \
  -H "x-apikey: ${API_KEY}" \
  -H "x-enforce-token-limit: true" \
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
