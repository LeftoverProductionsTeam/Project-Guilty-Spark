// Actual Windows app/IPC/GPU and installed Guerilla launcher acceptance.
// No file-picker interaction, installer execution, map compilation or game proof.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect as assertion } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw Error('Use built Spark executable and a fresh output directory');
const output = path.resolve(destination);
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-tools-qa.exe');
await fs.copyFile(path.resolve(input), exe, fs.constants.COPYFILE_EXCL);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
  run = promisify(execFile),
  expect = assertion.configure({ timeout: 90000 });
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const data = path.join(output, 'library'),
  child = spawn(exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
const receipt = {
  appSha256: digest(await fs.readFile(exe)),
  mockedIpc: false,
  gameLaunched: false,
  installerExecuted: false,
  filePickerExercised: false,
  complete: false,
  errors: [],
};
let browser, page, launchedPid;
const windows = async (id) => {
  const result = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$p=Get-Process -Id ${Number(id)} -ErrorAction SilentlyContinue; if($p){@{pid=$p.Id;title=$p.MainWindowTitle;handle=$p.MainWindowHandle.ToInt64();responding=$p.Responding}|ConvertTo-Json -Compress}; exit 0`,
    ],
    { windowsHide: true, timeout: 10000 },
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
};
try {
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (response) => response.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .some((item) => item.url().includes('tauri.localhost')),
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((item) => item.url().includes('tauri.localhost'));
  page.on('pageerror', (error) => receipt.errors.push(String(error)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      preferredHalo: 'mccSteam',
      autoBuild: false,
      hekDirectory: null,
      hekFlavor: null,
      invaderDirectory: null,
    },
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
  // Identify the disposable QA window without changing app behavior/state.
  await page
    .locator('#gs-window-header')
    .evaluate((element) => element.setAttribute('title', 'Disposable Spark tool/material acceptance copy'));
  const report = await call('tool_ecosystem_report', { runtimeId: 'mccSteam', projectId: null });
  const guerilla = report.tools.find((row) => row.definition.id === 'guerilla');
  expect(guerilla.assessment.executableFound).toBe(true);
  const originalExeSha = digest(await fs.readFile(guerilla.executable));
  receipt.automaticKitDiscoveryWithoutConfiguredFolder = true;
  // Seed a user-selection fixture in this private library, then exercise the
  // production report/revalidation/launch path. Do not claim a GUI file pick.
  const selected = {
    toolId: 'guerilla',
    path: guerilla.executable,
    sha256: originalExeSha,
    architecture: 'x86',
    available: true,
  };
  const database = new DatabaseSync(path.join(data, 'library.sqlite3'));
  const store = () =>
    database
      .prepare(
        'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run('tool-user-launcher-guerilla', JSON.stringify(selected));
  try {
    // The installed kit can be x86 or x64; its read-only PE header supplies ABI.
    const bytes = await fs.readFile(guerilla.executable),
      offset = bytes.readUInt32LE(60);
    selected.architecture = bytes.readUInt16LE(offset + 4) === 0x8664 ? 'x86_64' : 'x86';
    store();
    await page.getByRole('button', { name: /Find tools/ }).click();
    const finder = page.getByRole('dialog');
    await expect(finder.getByRole('link', { name: 'Get Guerilla · tag editor', exact: true })).toBeVisible();
    await finder.getByRole('button', { name: 'Launch Guerilla · tag editor', exact: true }).click();
    const message = finder.getByText(/Opened Guerilla.*PID/);
    await expect(message).toBeVisible();
    launchedPid = Number((await message.innerText()).match(/PID (\d+)/)[1]);
    let observed;
    await expect
      .poll(async () => {
        observed = await windows(launchedPid);
        return observed?.handle ?? 0;
      })
      .not.toBe(0);
    expect(observed.responding).toBe(true);
    expect(observed.title).not.toMatch(/fatal|error/i);
    receipt.registeredApplicationLaunch = {
      actualApplication: 'installed Guerilla',
      nativePid: launchedPid,
      windowTitle: observed.title,
      responding: true,
      sourceArgumentsPassed: false,
    };
    await run(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-Process -Id ${launchedPid}).CloseMainWindow()|Out-Null`],
      { windowsHide: true, timeout: 10000 },
    );
    await expect.poll(async () => await windows(launchedPid)).toBeNull();
    launchedPid = null;
    selected.sha256 = '0'.repeat(64);
    store();
    await expect(
      call('launch_discovered_tool', { runtimeId: 'mccSteam', projectId: null, toolId: 'guerilla' }),
    ).rejects.toThrow(/changed|missing/i);
    selected.sha256 = originalExeSha;
    store();
    receipt.changedLauncherIdentityRefused = true;
    await page.keyboard.press('Escape');
  } finally {
    database.close();
  }
  for (const runtimeId of ['mccSteam', 'haloCustomEdition', 'openCe', 'chupathingyCe']) {
    const source = await call('runtime_texture_source', { runtimeId });
    const paths = source.inspection.tags.filter(
      (tag) =>
        tag.class === 'senv' &&
        ['levels/test/bloodgulch/shaders/cap_metal', 'levels/test/bloodgulch/shaders/blood ground'].includes(
          tag.path.replaceAll('\\', '/'),
        ),
    );
    expect(paths).toHaveLength(2);
    receipt[runtimeId] = {
      previewCacheVersion: source.inspection.header.version,
      sourceSha256: source.inspection.sha256,
      shaderCount: paths.length,
    };
  }
  await page.getByRole('button', { name: /Find tools/ }).click();
  const search = page.getByRole('textbox', { name: 'Search workspaces' });
  await search.fill('QuickForge');
  await search.press('Enter');
  await page.getByRole('button', { name: 'Create a new Halo level', exact: true }).click();
  const title = `C42 native defaults ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('textbox', { name: 'New map name' }).fill(title);
  await page.getByRole('combobox', { name: 'New map runtime' }).selectOption('mccSteam');
  await page.getByRole('button', { name: 'Create editable map', exact: true }).click();
  const materials = page.locator('.forge-viewport [data-native-material-count]');
  await expect(materials).toHaveAttribute('data-native-material-count', '2');
  const sourceId = await materials.getAttribute('data-native-material-source');
  expect(sourceId).toBeTruthy();
  const entry = (await call('bootstrap')).entries.find((item) => item.title === title);
  expect(entry).toBeTruthy();
  const created = await call('open_project', { id: entry.id });
  expect(created.project.quickForge.materials.every((material) => material.shaderPath)).toBe(true);
  expect(created.project.nativeAssetImports ?? []).toHaveLength(0);
  receipt.quickForgeDefaults = {
    actualUiCreation: true,
    invaderConfigured: false,
    materials: created.project.quickForge.materials,
    actualNativeMaterialPreviews: 2,
    materialSourceId: sourceId,
  };
  await page.getByRole('button', { name: 'Toggle Map sounds', exact: true }).click();
  await page.getByRole('combobox', { name: 'QuickForge sound source map' }).selectOption('');
  await expect(materials).toHaveAttribute('data-native-material-count', '2');
  await expect(materials).toHaveAttribute('data-native-material-source', sourceId);
  receipt.soundBrowsingDoesNotClearSurfaceTextures = true;
  await page.getByRole('button', { name: 'Close Map sounds', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'quickforge-default-textures.png') });
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Use current room / box / ramp source', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Native BSP Workshop', exact: true })).toHaveAttribute('data-textures', '2');
  receipt.bspWorkshopUsesTheSameDefaultTextures = true;
  await page.screenshot({ path: path.join(output, 'bsp-default-textures.png') });
  expect(digest(await fs.readFile(guerilla.executable))).toBe(originalExeSha);
  receipt.installedToolUnchanged = true;
  expect(receipt.errors).toEqual([]);
  receipt.complete = true;
} catch (error) {
  receipt.error = String(error);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  if (launchedPid)
    await run(
      'powershell.exe',
      ['-NoProfile', '-Command', `$owned=Get-CimInstance Win32_Process -Filter 'ProcessId=${launchedPid}'; if($owned.ParentProcessId -eq ${child.pid}){Stop-Process -Id ${launchedPid} -ErrorAction SilentlyContinue}`],
      { windowsHide: true },
    ).catch(() => {});
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  console.log(JSON.stringify({ complete: receipt.complete, error: receipt.error, output }));
}
