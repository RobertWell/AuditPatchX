import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Exclude Playwright E2E tests — they use a different runner (playwright test)
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
