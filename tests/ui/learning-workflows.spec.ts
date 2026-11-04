import { test, expect } from '@playwright/test';
import { chooseTool } from './helpers/navigation';

test('every feature has a searchable compact guide with preserved scope and working entry navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await chooseTool(page, 'Learning center');
  const search = page.getByRole('searchbox', { name: 'Find a demo or workflow' });
  await expect(search).toBeVisible();
  const category = page.getByRole('combobox', { name: 'Workflow category' });
  await category.selectOption('BSP Workshop');
  await page.getByRole('button', { name: 'Rooms, corridors & named BSP volumes', exact: true }).click();
  const guide = page.locator('.learning-guide');
  await expect(guide).toContainText('Volume name');
  await expect(guide).toContainText('Two rooms + corridor + ramp');
  await expect(guide.getByText('You’ll need:', { exact: true })).toBeVisible();
  await guide.getByRole('button', { name: 'Create or open source map', exact: true }).click();
  await expect(page.locator('.library-page')).toBeVisible();
  await chooseTool(page, 'Learning center');
  await expect(guide).toHaveAttribute('data-workflow', 'bsp-workshop');
  await expect(category).toHaveValue('BSP Workshop');
  await page.getByRole('button', { name: 'Door & two-way trigger demo', exact: true }).click();
  await expect(guide).toContainText('Cover both sides');
  await guide.getByText('Supported scope & remaining checks', { exact: true }).click();
  await expect(guide).toContainText('H1A Standalone');
  await expect(guide).toContainText('Other doors, retail MCC cache loading');
  await category.selectOption('All');
  await search.fill('Invader reconcile');
  await expect(page.getByRole('navigation', { name: 'Task guides' }).getByRole('button')).toHaveCount(1);
  await expect(guide).toHaveAttribute('data-workflow', 'native-external-roundtrip');
  await search.fill('');
  await expect(page.getByRole('navigation', { name: 'Task guides' }).getByRole('button')).toHaveCount(8);
  const visited: string[] = [];
  do {
    visited.push(
      ...(await page.getByRole('navigation', { name: 'Task guides' }).getByRole('button').allTextContents()),
    );
    const next = page.locator('.learning-guide-paging').getByRole('button', { name: 'Next', exact: true });
    if (!(await next.isEnabled())) break;
    await next.click();
  } while (visited.length < 200);
  const count = await page.evaluate(
    async () => (await import('/src/featureCatalog.ts')).SPARK_FEATURES.length,
  );
  expect(visited).toHaveLength(count);
  expect(new Set(visited).size).toBe(count);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
