#!/bin/sh
cat <<EOF > /usr/share/nginx/html/env-config.js
window.__RUNTIME_CONFIG__ = {
  ADMIN_USER_EMAIL: "${ADMIN_USER_EMAIL:-admin@example.com}",
  SALES_AGENT_EMAIL: "${SALES_AGENT_EMAIL:-sales.agent@example.com}",
  LOANS_AGENT_EMAIL: "${LOANS_AGENT_EMAIL:-loans.agent@example.com}",
  SSO_USER_EMAIL: "${SSO_USER_EMAIL:-admin@example.com}",
  DEFAULT_ENV: "${DEFAULT_ENV:-prod}"
};
EOF
