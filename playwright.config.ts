import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:1420', channel: 'msedge' },
  webServer: {
    command: 'node scripts/run-vite.mjs',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: true,
  },
});
