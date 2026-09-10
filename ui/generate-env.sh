#!/bin/sh
cat <<EOF > /usr/share/nginx/html/env-config.js
window.__RUNTIME_CONFIG__ = {
  BRONZE_API_KEY: "${BRONZE_API_KEY:-}",
  SILVER_API_KEY: "${SILVER_API_KEY:-}",
  SALES_API_KEY: "${SALES_API_KEY:-}",
  BRONZE_USER_EMAIL: "${BRONZE_USER_EMAIL:-bronze.user@example.com}",
  SILVER_USER_EMAIL: "${SILVER_USER_EMAIL:-silver.user@example.com}",
  SALES_AGENT_EMAIL: "${SALES_AGENT_EMAIL:-sales.agent@example.com}",
  SSO_USER_EMAIL: "${SSO_USER_EMAIL:-demo.user@google.com}"
};
EOF
