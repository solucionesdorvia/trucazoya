import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    // Los tests de integración tocan la misma base: sin paralelismo entre archivos.
    fileParallelism: false,
    env: { DATABASE_URL: 'postgresql://trucazo:trucazo@localhost:54341/trucazo?schema=public' },
  },
});
