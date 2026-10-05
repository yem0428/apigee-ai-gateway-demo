// Local development runtime config fallback (overridden by Cloud Run container at startup)
window.__RUNTIME_CONFIG__ = window.__RUNTIME_CONFIG__ || {
  SSO_USER_EMAIL: 'admin@example.com',
};
