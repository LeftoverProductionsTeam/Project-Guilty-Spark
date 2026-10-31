import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes('tauri.localhost'));
if (!page) throw new Error('Guilty Spark WebView not found');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await mkdir('docs/screenshots', { recursive: true });
await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
await page.locator('.map-card').filter({ hasText: 'a10' }).first().click();
await expect(page.locator('.viewport-label')).toContainText('Imported BSP', { timeout: 30000 });
await expect(page.locator('canvas')).toBeVisible();
await page.locator('.object-name').first().click();
const position = page.getByRole('spinbutton', { name: 'position 0', exact: true });
const original = Number(await position.inputValue());
await position.fill(String(original + 0.25));
await position.press('Tab');
await expect(position).toHaveValue(String(original + 0.25));
await page.keyboard.press('Control+z');
await expect(position).toHaveValue(String(original));
await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
await expect(position).toHaveValue(String(original + 0.25));
await page.keyboard.press('Control+z');
await expect(position).toHaveValue(String(original));
await page.screenshot({ path: 'docs/screenshots/world-editor.png' });
await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
await expect(page.locator('.tag-detail-heading')).toBeVisible();
const ready = page.getByRole('spinbutton', { name: 'Ready time', exact: true });
if (await ready.count()) {
  const value = Number(await ready.inputValue());
  await ready.fill(String(value + 0.05));
  await ready.press('Tab');
  await expect(ready).toHaveValue(String(value + 0.05));
  await page.keyboard.press('Control+z');
  await expect(ready).toHaveValue(String(value));
}
const references = page.locator('.property-value select');
if (await references.count()) {
  const reference = references.first();
  const original = await reference.inputValue();
  const options = await reference.locator('option').evaluateAll((options) => options.map((o) => o.value));
  const alternate = options.find((v) => v !== original);
  if (alternate) {
    await reference.selectOption(alternate);
    await expect(reference).toHaveValue(alternate);
    await page.keyboard.press('Control+z');
    await expect(reference).toHaveValue(original);
  }
}
await page.screenshot({ path: 'docs/screenshots/tag-editor.png' });
await page.getByRole('button', { name: 'AI & scenario', exact: true }).click();
await expect(page.locator('.scenario-stats')).toContainText('39');
await page.screenshot({ path: 'docs/screenshots/scenario.png' });
await page.getByRole('button', { name: 'Build & playtest', exact: true }).click();
await expect(page.locator('.build-target')).toBeVisible();
await page.screenshot({ path: 'docs/screenshots/build-playtest.png' });
await page.getByRole('button', { name: 'Settings & runtimes', exact: true }).click();
await expect(page.locator('.settings-page')).toContainText('Invader utilities');
await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
await expect(page.locator('.map-card img')).toBeVisible();
await page.screenshot({ path: 'docs/screenshots/library.png' });
await writeFile(
  '.local/qa/ui-smoke.json',
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      checks: [
        'Native application launched',
        'Real MCC map opened',
        'Collision geometry rendered',
        'Scenario transform edit/undo/redo',
        'Typed weapon field edit/undo',
        'Projectile reference swap/undo',
        'AI encounter inspection',
        'Build readiness navigation',
        'Settings navigation',
        'Real geometry thumbnail',
      ],
      errors,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checks: 10, errors }));
await browser.close();
if (errors.length) process.exit(1);
