// Synthetic rendering/IPC contracts. Runtime and real binary gates also have native tests.
import { test, expect } from '@playwright/test';
import catalog from '../../crates/spark-core/data/tool_ecosystem.json' with { type: 'json' };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ catalog }) => {
      const w = window as any;
      w.isTauri = true;
      w.companionCalls = [];
      let registered = false;
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          w.companionCalls.push({ command, args });
          if (command === 'tool_ecosystem_report') {
            const version = Number(args.projectId.split('-')[1]);
            const eligible = args.runtimeId === 'haloCustomEdition' && version === 609;
            return {
              projectId: args.projectId,
              context: { runtimeId: args.runtimeId, sourceKind: 'classicCache', cacheVersion: version },
              tools: [
                {
                  definition: catalog.tools.find((t) => t.id === 'openceMantle'),
                  assessment: {
                    state:
                      args.runtimeId !== 'haloCustomEdition'
                        ? 'requiresRuntime'
                        : !eligible
                          ? 'cacheUnsupported'
                          : registered
                            ? 'installed'
                            : 'availableForSetup',
                    canUseWorkflow: eligible && registered,
                    executableFound: registered,
                  },
                  externalCompanion: registered
                    ? {
                        available: true,
                        registration: { path: 'C:/fixture/Mantle.exe', executableSha256: 'a'.repeat(64) },
                        detail: 'Registered file only; application behavior unverified.',
                      }
                    : null,
                },
              ],
              companionCandidates: catalog.companionCandidates,
            };
          }
          if (command === 'choose_external_companion_path') return 'C:/fixture/Mantle.exe';
          if (command === 'register_external_companion') {
            registered = true;
            return null;
          }
          if (command === 'forget_external_companion') {
            registered = false;
            return null;
          }
          if (command === 'launch_external_companion')
            return 'Launch request submitted; application startup unverified.';
          throw Error('Unexpected fixture IPC: ' + command);
        },
      };
    },
    { catalog },
  );
  await page.goto('/tests/ui/fixtures/toolEcosystem.html');
});
test('companion visibility follows runtime and cache and candidates have no launcher', async ({ page }) => {
  await expect(page.getByText('OpenCE Mantle — External Companion', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch Mantle' })).toBeDisabled();
  await page.getByRole('button', { name: 'MCC map', exact: true }).click();
  await expect(page.getByText('OpenCE Mantle — External Companion', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Demo map', exact: true }).click();
  await expect(page.getByText('OpenCE Mantle — External Companion', { exact: true })).toHaveCount(0);
  await page.getByText('Companion candidates · evidence needed', { exact: true }).click();
  await expect(
    page.getByText('leftknut tool candidate · identity unverified', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).companionCalls.some(
        (c: any) => c.command.includes('launch') || c.command.includes('download'),
      ),
    ),
  ).toBe(false);
});
test('selection never launches and cancelling confirmation sends no launch IPC', async ({ page }) => {
  await page.getByRole('button', { name: 'Select installed application', exact: true }).click();
  const launch = page.getByRole('button', { name: 'Launch Mantle', exact: true });
  await expect(launch).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).companionCalls.filter((c: any) => c.command === 'launch_external_companion'),
    ),
  ).toHaveLength(0);
  page.once('dialog', (dialog) => dialog.dismiss());
  await launch.click();
  expect(
    await page.evaluate(() =>
      (window as any).companionCalls.filter((c: any) => c.command === 'launch_external_companion'),
    ),
  ).toHaveLength(0);
  page.once('dialog', (dialog) => dialog.accept());
  await launch.click();
  await expect(
    page.getByText('Launch request submitted; application startup unverified.', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).companionCalls.filter((c: any) => c.command === 'launch_external_companion'),
    ),
  ).toEqual([
    {
      command: 'launch_external_companion',
      args: { runtimeId: 'haloCustomEdition', projectId: 'cache-609', confirmExternalLaunch: true },
    },
  ]);
  await page.getByRole('button', { name: 'Forget selection', exact: true }).click();
  await expect(launch).toBeDisabled();
});
