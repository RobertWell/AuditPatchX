import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Exclude Playwright E2E tests — they use a different runner (playwright test)
    exclude: ['e2e/**', 'node_modules/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // Cover the app's OWN code. Excluded: non-executable scaffolding (entry
      // point, type-only decls, tests) and the vendored shadcn/ui primitives
      // under components/ui (generated third-party boilerplate — several, e.g.
      // sidebar/sheet/tabs/tooltip, have zero importers). No app logic excluded.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        'src/types/**',
        'src/components/ui/**',
      ],
    },
  },
});
