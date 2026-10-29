import { test, expect } from '@playwright/test';
test('combined-world visibility zones persist per map and draw real portal handles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('/');
  await page.evaluate(async () => {
    const module = await import('/tests/ui/fixtures/visibilityZones.tsx');
    module.mount();
  });
  const panel = page.locator('.gs-visibility-zones');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'Add tunnel zone', exact: true }).click();
  await expect(panel.getByLabel('Visibility entrance percent')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Check portal source' })).toBeDisabled();
  const first = JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}');
  expect(first.bspAssembly.visibilityZones).toHaveLength(1);
  expect(first.bspAssembly.visibilityZones[0].kind).toBe('tunnel');
  await panel.getByLabel('Visibility entrance percent').fill('25');
  await panel.getByLabel('Visibility entrance percent').blur();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}').bspAssembly
          .visibilityZones[0].start,
    )
    .toBe(0.25);
  await panel.getByRole('button', { name: 'Frame zone' }).click();
  await expect(page.locator('.world-layout canvas')).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.locator('.world-layout canvas').getAttribute('data-gs-camera-pose')) ?? '{}')
          .target?.[0],
    )
    .toBeCloseTo(5.5, 2);
  const drag = await page.evaluate(async () => {
    const module = await import('/tests/ui/fixtures/visibilityZones.tsx');
    return module.portalAxisDrag();
  });
  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.mouse.move(drag.to.x, drag.to.y, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}').bspAssembly
          .visibilityZones[0].start,
    )
    .not.toBe(0.25);
  const dragged = JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}').bspAssembly
    .visibilityZones[0].start;
  await page.screenshot({ path: '.local/continuation34/visibility-zones-browser.png' });
  await page.getByRole('button', { name: 'Switch synthetic map' }).click();
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'Add planning box' }).click();
  await expect(panel.getByText(/Editor-only bounds/)).toBeVisible();
  const second = JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}');
  expect(second.id).toBe('zone-map-b');
  expect(second.bspAssembly.visibilityZones[0].kind).toBe('editorBounds');
  await page.getByRole('button', { name: 'Switch synthetic map' }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('zone-project').textContent()) ?? '{}').bspAssembly
          .visibilityZones[0].start,
    )
    .toBe(dragged);
  expect(JSON.parse((await page.getByTestId('zone-edit-log').textContent()) ?? '[]').length).toBe(4);
  expect(errors).toEqual([]);
});
