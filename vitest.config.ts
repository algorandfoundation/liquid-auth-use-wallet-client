// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: './globalTestSetup.ts',
    coverage: {
      include: ['src/**/*.ts'],
    },
  },
});