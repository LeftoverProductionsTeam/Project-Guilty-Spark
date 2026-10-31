// Synthetic IPC/UI contracts; these never count as native edit/game acceptance.
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    w.calls = [];
    w.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        w.calls.push({ command, args });
        if (command === 'smart_edit_plan') {
          const result = {
            id: 'plan-' + args.projectId,
            projectId: args.projectId,
            projectFingerprint: 'b'.repeat(64),
            sourceSha256: 'a'.repeat(64),
            runtimeId: args.runtimeId,
            cacheVersion: 13,
            intents: [
              {
                kind: 'setTagNumber',
                tagId: 7,
                tagPath: 'weapons/pistol/pistol',
                class: 'weap',
                fieldKey: 'bounding-radius',
                before: 0.1,
                after: 0.225,
              },
            ],
            choices: [
              {
                route: 'directCache',
                available: true,
                reason: 'Contract direct route.',
                tools: ['Contract CRC'],
              },
            ],
            selectedRoute: 'directCache',
            recovery: 'Contract recovery',
            notes: ['Contract notes'],
            expiresAtUnix: Date.now() / 1000 + 300,
          };
          if (w.delayPlan)
            return new Promise((resolve) => {
              w.releasePlan = () => resolve(result);
            });
          return result;
        }
        if (command === 'smart_edit_execute')
          return {
            route: 'directCache',
            jobId: 'job',
            status: 'validated',
            record: { output: 'owned/output.map', message: 'Contract validation only.' },
            liveReceipts: [],
          };
        throw Error('Unexpected fixture call ' + command);
      },
    };
  });
  await page.goto('/tests/ui/fixtures/smartEdit.html');
  await page.locator('.smart-edit>summary').click();
});
test('save plan stays compact, saves first and exposes one validated result', async ({ page }) => {
  await page.getByRole('spinbutton', { name: 'Bounding radius', exact: true }).fill('0.225');
  await page.getByRole('spinbutton', { name: 'Bounding radius', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Review save plan', exact: true }).click();
  await expect(page.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
  await page.getByRole('button', { name: 'Save validated map copy', exact: true }).click();
  await expect(page.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
  expect(await page.evaluate(() => (window as any).saved)).toBe(2);
  expect(await page.evaluate(() => (window as any).calls.map((c: any) => c.command))).toEqual([
    'smart_edit_plan',
    'smart_edit_execute',
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});
test('a new edit expires the visible plan and requires another review', async ({ page }) => {
  await page.getByRole('button', { name: 'Review save plan', exact: true }).click();
  await expect(page.locator('.smart-edit-plan')).toBeVisible();
  const field = page.getByRole('spinbutton', { name: 'Bounding radius', exact: true });
  await field.fill('0.5');
  await field.press('Tab');
  await expect(page.locator('.smart-edit-plan')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as any).calls.filter((c: any) => c.command === 'smart_edit_execute').length,
    ),
  ).toBe(0);
});
test('an automatic audio metadata refresh during save keeps the authored plan', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).refreshAudio = true;
  });
  await page.getByRole('button', { name: 'Review save plan', exact: true }).click();
  await expect(page.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
  expect(
    await page.evaluate(
      () => (window as any).calls.filter((c: any) => c.command === 'smart_edit_plan').length,
    ),
  ).toBe(1);
});
test('a late plan from another map never appears or locks the new map', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).delayPlan = true;
  });
  await page.getByRole('button', { name: 'Review save plan', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).releasePlan)).toBe('function');
  await page.getByRole('button', { name: 'Switch map', exact: true }).click();
  await page.evaluate(() => {
    (window as any).releasePlan();
  });
  await expect(page.locator('.smart-edit')).toHaveAttribute('data-smart-edit-project', 'b');
  await expect(page.locator('.smart-edit-plan')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review save plan', exact: true })).toBeEnabled();
});
