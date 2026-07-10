import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served from a domain root (company domain). Absolute base is required for
  // clean-URL routing: with base './' the bundled asset paths would resolve
  // relative to a deep route like /admin/users and 404 on a hard refresh.
  // (If you ever deploy under a sub-path, set this to '/<subpath>/' — routes.ts
  // reads import.meta.env.BASE_URL and adapts automatically.)
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  // The embedded-Postgres data dir lives at server/data/pgdata (inside the repo).
  // Keep Vite's file watcher off it — Postgres constantly rewrites WAL/stat files,
  // which otherwise triggers reload churn and Windows EBUSY/file-lock errors.
  server: {
    watch: {
      ignored: ['**/server/data/**'],
    },
  }
});
