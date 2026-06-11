import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['services/store.ts'],
      // Regression ratchet: locked to current actual coverage so it can only
      // improve, never regress. Raise these as tests are added (target: 70%).
      thresholds: {
        lines: 26,
        functions: 20,
        branches: 23,
        statements: 26,
      },
    },
  },
});
