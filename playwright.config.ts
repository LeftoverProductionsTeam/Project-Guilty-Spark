import { defineConfig } from '@playwright/test';
const port = process.env.SPARK_UI_TEST_PORT ?? '1420';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Invalid loopback UI test port');
const baseURL = `http://127.0.0.1:${port}`;
const evidenceDirectory = process.env.SPARK_BROWSER_EVIDENCE_DIR;
if (!evidenceDirectory) throw new Error('Use scripts/frontend-tests.mjs browser so browser output is owned and disposable.');
if (/(?:^|[\\/])\.local(?:[\\/]|$)/i.test(evidenceDirectory))
  throw new Error('Obsolete .local browser output is disabled; use scripts/frontend-tests.mjs browser for an owned external workspace.');
export default defineConfig({
  testDir: './tests/ui',
  outputDir: evidenceDirectory,
  timeout: 30000,
  retries: 0,
  use: {
    baseURL,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
