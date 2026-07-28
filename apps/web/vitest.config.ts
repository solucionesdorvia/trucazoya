import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    // Sólo los unit/integración de src; los E2E de Playwright (e2e/) van aparte.
    include: ['src/**/*.{test,spec}.ts'],
    // Los tests de integración tocan la misma base: sin paralelismo entre archivos.
    fileParallelism: false,
    env: { DATABASE_URL: 'postgresql://trucazo:trucazo@localhost:54341/trucazo?schema=public' },
  },
});
