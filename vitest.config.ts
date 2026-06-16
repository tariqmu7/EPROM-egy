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
        lines: 28,
        functions: 24,
        branches: 24,
        statements: 28,
      },
    },
  },
});
