/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the local self-hosted API (server/ — Node + embedded Postgres).
  readonly VITE_API_URL: string;
  // How often the SPA polls the API for updates (ms).
  readonly VITE_POLL_INTERVAL_MS: string;
  // Bootstrap admin email (first-run / recovery admin access).
  readonly VITE_BOOTSTRAP_ADMIN_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
