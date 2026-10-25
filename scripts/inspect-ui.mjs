import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes('tauri.localhost') || p.url().includes('127.0.0.1:1420'));
if (!page) throw new Error('The Guilty Spark WebView was not found');
await page.waitForLoadState('domcontentloaded');
await mkdir('docs/screenshots', { recursive: true });
console.log(
  JSON.stringify(
    {
      url: page.url(),
      title: await page.title(),
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      text: (await page.locator('body').innerText()).slice(0, 6500),
    },
    null,
    2,
  ),
);
await page.screenshot({ path: 'docs/screenshots/library.png' });
await browser.close();
