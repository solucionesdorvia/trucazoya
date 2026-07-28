import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de páginas públicas. Corre contra una URL desplegada (no necesita
 * servidor local ni base sembrada), configurable con E2E_BASE_URL.
 *
 *   E2E_BASE_URL=https://trucazoweb-production.up.railway.app \
 *     pnpm --filter @trucazo/web test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://trucazoweb-production.up.railway.app',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
