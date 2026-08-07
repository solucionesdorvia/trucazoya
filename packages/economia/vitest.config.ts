import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      DATABASE_URL: 'postgresql://trucazo:trucazo@localhost:54341/trucazo?schema=public',
      // Los tests ejercitan el circuito de dinero real, así que lo habilitan
      // explícitamente (en producción el default es apagado).
      FEATURE_REAL_MONEY: 'true',
    },
  },
});
