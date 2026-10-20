import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example-project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      FRONTEND_URL: 'http://localhost:5173',
    },
  },
});
