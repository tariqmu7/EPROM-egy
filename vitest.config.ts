import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/services/store.ts'],
      // Regression ratchet: locked to current actual coverage so it can only
      // improve, never regress. Raise these as tests are added (target: 70%).
      thresholds: {
        lines: 36,
        functions: 31,
        branches: 31,
        statements: 35,
      },
    },
  },
});
