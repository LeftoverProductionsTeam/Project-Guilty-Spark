// Opt-in real Windows/Spark/HTTPS/extraction acceptance. No mocked IPC, installer
// execution, registry changes, original game writes or public game connections.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 });
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (
    !['--app', '--output', '--existing'].includes(process.argv[i]) ||
    !process.argv[i + 1] ||
    args.has(process.argv[i])
  )
    throw Error('Use unique --app built.exe --output fresh-folder --existing owned-CE-folder');
  args.set(process.argv[i], path.resolve(process.argv[i + 1]));
}
if (args.size !== 3) throw Error('All three named arguments required');
const output = args.get('--output'),
  original = args.get('--existing');
await fs.mkdir(output);
const hash = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
async function inventory(root, relative = '', result = {}) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Owned game tree contains a link');
    const name = path.join(relative, entry.name),
      file = path.join(root, name);
    if (entry.isDirectory()) await inventory(root, name, result);
    else if (entry.isFile()) result[name.replaceAll('\\', '/')] = await hash(file);
    if (Object.keys(result).length > 2000) throw Error('Owned game inventory exceeded its bound');
  }
  return result;
}
const before = await inventory(original),
  errors = [];
const receipt = {
  schemaVersion: 1,
  appSha256: await hash(args.get('--app')),
  mockedIpc: false,
  networkDownload: true,
  setupExecutablesRun: false,
  gameLaunched: false,
  complete: false,
};
const exe = path.join(output, 'GuiltySpark-CE-setup-qa.exe');
await fs.copyFile(args.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(output, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser, page;
try {
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (e) => errors.push(String(e)));
  const call = (command, a = {}) =>
    page.evaluate(({ command, a }) => window.__TAURI_INTERNALS__.invoke(command, a), { command, a });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      preferredHalo: 'haloCustomEdition',
      onboardingCompleted: true,
      autoBuild: false,
    },
  });
  await page.reload();
  let setup = await call('custom_edition_setup');
  expect(setup.canExtract).toBe(true);
  expect(setup.installation).not.toBeNull();
  expect(setup.installation.executableSha256).toBe(await hash(path.join(original, 'haloce.exe')));
  const stale = await call('connect_custom_edition', {
    chooseFolder: false,
    expectedSha256: '0'.repeat(64),
  }).then(() => '', String);
  expect(stale).toContain('changed');
  receipt.staleDetectionRefused = true;
  await call('connect_custom_edition', {
    chooseFolder: false,
    expectedSha256: setup.installation.executableSha256,
  });
  expect((await call('custom_edition_setup')).installation.registered).toBe(true);
  receipt.existingGameConnectedWithoutDownload = true;
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name: 'Settings & tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Dependencies & setup', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Dependency target runtime', exact: true })
    .selectOption('haloCustomEdition');
  const panel = page.getByRole('region', { name: 'Custom Edition installation', exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Install separate copy…' }).click();
  await expect(panel.getByText(/not publisher authentication/)).toBeVisible();
  const started = performance.now();
  await panel.getByRole('button', { name: 'Download & install Custom Edition' }).click();
  await expect
    .poll(
      async () => {
        setup = await call('custom_edition_setup');
        if (setup.job?.phase === 'failed') throw Error(setup.job.detail);
        return setup.job?.phase;
      },
      { timeout: 240000, intervals: [250, 500, 750] },
    )
    .toBe('complete');
  receipt.installDurationMs = Math.round(performance.now() - started);
  expect(setup.installation.registered).toBe(true);
  const installed = setup.installation.root;
  expect(await fs.realpath(installed)).not.toBe(await fs.realpath(original));
  const installReceipt = JSON.parse(
    await fs.readFile(path.join(installed, '..', 'spark-ce-install.json'), 'utf8'),
  );
  expect(installReceipt.archiveSha256).toBe(
    '33cf0e24551db62a08239d29077afbf9cdb2aec5c13234022c38ef144d486a3a',
  );
  expect(installReceipt.publisherAuthenticated).toBe(false);
  for (const file of [
    'haloce.exe',
    'haloceded.exe',
    'maps/ui.map',
    'maps/bloodgulch.map',
    'maps/bitmaps.map',
    'maps/sounds.map',
    'maps/loc.map',
  ])
    expect(await hash(path.join(installed, file))).toBe(installReceipt.files[`Halo Custom Edition/${file}`]);
  for (const file of ['GSArcade.exe', 'haloupdate.exe', 'Uninstal.exe', 'redist/msxmlenu.msi', 'Setup'])
    expect(
      await fs.stat(path.join(installed, file)).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  receipt.installation = {
    root: installed,
    executableSha256: setup.installation.executableSha256,
    files: Object.keys(installReceipt.files).length,
    archiveSha256: installReceipt.archiveSha256,
  };
  const reports = await call('runtime_report');
  const ce = reports.find((r) => r.id === 'haloCustomEdition');
  expect(ce.installation.executableSha256).toBe(setup.installation.executableSha256);
  const map = await call('import_paths', { paths: [path.join(installed, 'maps/bloodgulch.map')] });
  expect(map[0].inspection.header.version).toBe(609);
  receipt.nativeMap = {
    cacheVersion: map[0].inspection.header.version,
    tags: map[0].inspection.tags.length,
    sha256: map[0].project.source.sha256,
  };
  await expect(panel.getByText(/Custom Edition installed and connected/)).toBeVisible();
  await page.screenshot({ path: path.join(output, 'custom-edition-setup.png') });
  await page.reload();
  expect((await call('custom_edition_setup')).installation.registered).toBe(true);
  receipt.registrationSurvivesReload = true;
  expect(await inventory(original)).toEqual(before);
  receipt.originalFilesUnchanged = Object.keys(before).length;
  expect(errors).toEqual([]);
  receipt.javascriptErrors = errors;
  receipt.complete = true;
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      complete: true,
      installDurationMs: receipt.installDurationMs,
      nativeMap: receipt.nativeMap,
      originalFilesUnchanged: receipt.originalFilesUnchanged,
    }),
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.javascriptErrors = errors;
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
