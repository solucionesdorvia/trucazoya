import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL: 'postgresql://trucazo:trucazo@localhost:54341/trucazo?schema=public',
      GAME_TOKEN_SECRET: 'secreto-de-test-suficientemente-largo-1234',
    },
  },
});
