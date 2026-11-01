import { defineConfig } from '@playwright/test';
const port = process.env.SPARK_UI_TEST_PORT ?? '1420';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Invalid loopback UI test port');
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/ui',
  outputDir: process.env.SPARK_BROWSER_EVIDENCE_DIR ?? './test-results',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.SPARK_RELEASE_GATES !== '1' && !process.env.CI,
  },
});
