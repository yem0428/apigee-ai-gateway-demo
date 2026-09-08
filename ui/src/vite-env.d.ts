/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRONZE_API_KEY?: string;
  readonly VITE_BRONZE_USER_EMAIL?: string;
  readonly VITE_SILVER_API_KEY?: string;
  readonly VITE_SILVER_USER_EMAIL?: string;
  readonly VITE_SALES_API_KEY?: string;
  readonly VITE_SALES_AGENT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
