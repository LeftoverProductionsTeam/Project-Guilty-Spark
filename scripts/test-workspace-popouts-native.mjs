// Real Windows/WebView acceptance. Uses an isolated library and only its own app process.
// No mocked IPC, game launch, external tool execution or original project mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium, expect as assertion } from '@playwright/test';

const args = process.argv.slice(2);
function option(name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
const app = path.resolve(option('--app', 'target/release/GuiltySpark.exe'));
const destination = option('--output');
if (!destination) throw Error('Choose a new --output directory for the isolated acceptance record.');
const output = path.resolve(destination), baseline = args.includes('--baseline');
await fs.mkdir(output); // Refuse to overwrite a previous result.
const exe = path.join(output, 'GuiltySpark-workspace-qa.exe');
await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
const report = { schemaVersion: 1, appSha256: crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex'),
  mockedIpc: false, gameOrExternalToolExecution: false, baseline, complete: false, windows: [], errors: [] };
const expect = assertion.configure({ timeout: 60000 });
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const processHandle = spawn(exe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env,
  GUILTY_SPARK_DATA_DIR: path.join(output, 'library'), WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
let browser, main;
const invoke = (page, command, args = {}) => page.evaluate(({ command, args }) =>
  window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
async function choose(page, name) {
  const drawer = page.locator('.gs-navigation-drawer');
  if (!await drawer.isVisible()) await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}
async function spawnedPage(previous) {
  let page;
  await expect.poll(() => {
    page = browser.contexts().flatMap(context => context.pages()).find(item => !previous.has(item) && item.url().includes('tauri.localhost'));
    return !!page;
  }).toBe(true);
  page.on('pageerror', error => report.errors.push(String(error)));
  await expect(page.getByRole('button', { name: 'Pop out workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(1);
  return page;
}
async function close(page) {
  await page.getByRole('button', { name: 'Close window', exact: true }).click();
  await expect.poll(() => page.isClosed()).toBe(true);
}
try {
  await expect.poll(() => fetch(`http://127.0.0.1:${port}/json/version`).then(response => response.ok, () => false)).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(() => browser.contexts().flatMap(context => context.pages()).some(page => page.url().includes('tauri.localhost'))).toBe(true);
  main = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'));
  main.on('pageerror', error => report.errors.push(String(error)));
  const boot = await invoke(main, 'bootstrap');
  await invoke(main, 'save_settings', { settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false } });
  await main.reload(); await main.setViewportSize({ width: 1280, height: 800 });
  await choose(main, baseline ? 'How-to & Glossary' : 'Learning center');
  if (!baseline) await main.getByRole('tab', { name: 'Guides', exact: true }).click();
  const guide = main.locator(baseline ? '.gs-how-to' : '.learning-center');
  await expect(guide).toBeVisible();
  report.guideLayout = await guide.evaluate(element => ({
    viewport: { width: innerWidth, height: innerHeight }, contentHeight: element.scrollHeight,
    contentWidth: element.scrollWidth, availableWidth: element.clientWidth,
    allTasksPresent: element.querySelectorAll('.analysis-card,.learning-guides nav button').length,
  }));
  await main.screenshot({ path: path.join(output, 'guides.png') });
  if (!baseline) {
    expect(report.guideLayout.allTasksPresent).toBe(10);
    expect(report.guideLayout.contentWidth).toBeLessThanOrEqual(report.guideLayout.availableWidth);
    await main.getByRole('tab', { name: 'Glossary', exact: true }).click();
    await main.getByRole('searchbox', { name: 'Search glossary', exact: true }).fill('Race vehicle');
    await expect(main.locator('.gs-glossary dt')).toHaveText(['Race vehicle and teleporter flags']);
    const previous = new Set(browser.contexts().flatMap(context => context.pages()));
    await main.getByRole('button', { name: 'Pop out workspace', exact: true }).click();
    const glossary = await spawnedPage(previous);
    await expect(glossary.getByRole('tab', { name: 'Glossary', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(glossary.getByRole('searchbox', { name: 'Search glossary', exact: true })).toHaveValue('Race vehicle');
    await glossary.screenshot({ path: path.join(output, 'glossary-window.png') });
    await close(glossary); report.glossarySelectionRetained = true;

    const routes = ['library','map-finder','get-started','features','learning','how-to','community','world','tags','assets','scenario','build','preservation','settings','compare','runtimes','live','quickforge','firefight','interface','creator','machinima','academy'];
    for (const workspace of routes) {
      const previous = new Set(browser.contexts().flatMap(context => context.pages()));
      const label = await invoke(main, 'open_workspace_window', { workspace, context: null, section: null });
      const page = await spawnedPage(previous);
      expect(new URL(page.url()).searchParams.get('workspace')).toBe(workspace);
      await expect(page.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace',['world','quickforge','live'].includes(workspace)?'level':['academy','how-to'].includes(workspace)?'learning':workspace);
      report.windows.push({ workspace, actualNativeWindow: true });
      if (workspace === 'academy' || workspace === 'how-to') await expect(page.getByRole('heading', { name: 'Learning center', exact: true })).toBeVisible();
      // Exercise native resizing; CDP viewport emulation alone is insufficient.
      if (workspace === 'learning') {
        await invoke(page, 'plugin:window|set_size', { label, value: { Logical: { width: 1000, height: 720 } } });
        report.resizedNativeWindow = await invoke(page, 'plugin:window|inner_size', { label });
        report.nativeWindowPosition = await invoke(page, 'plugin:window|outer_position', { label });
        report.physicalMonitorTransferTested = false;
      }
      await close(page);
    }
    // Keep three independent native windows open together, without detaching the main workspace.
    const retained = [];
    for (const [workspace, section] of [['learning','academy'],['settings','dependencies'],['runtimes',null]]) {
      const previous = new Set(browser.contexts().flatMap(context => context.pages()));
      await invoke(main, 'open_workspace_window', { workspace, section, context: section === 'academy' ? 'legacyPhilosophy' : null });
      const page = await spawnedPage(previous); retained.push(page);
      if (section === 'academy') await expect(page.locator('.gs-lesson-intro h2')).toHaveText('07 Halo Modding Brain: the original magic');
      if (section === 'dependencies') await expect(page.getByRole('tab', { name: 'Dependencies & setup', exact: true })).toHaveAttribute('aria-selected','true');
    }
    expect(retained.every(page => !page.isClosed())).toBe(true);
    report.simultaneousPopouts = retained.length;
    for (const page of retained) await close(page);
    const created=await invoke(main,'create_quickforge_project',{title:'Native pop-out acceptance',template:'smallIndoorArena',target:'haloCustomEdition'});
    await main.reload();
    await main.locator('.map-card').filter({has:main.getByRole('heading',{name:'Native pop-out acceptance',exact:true})}).click();
    await choose(main,'Tag editor');
    const previousProjectPages=new Set(browser.contexts().flatMap(context=>context.pages()));
    await main.getByRole('button',{name:'Pop out workspace',exact:true}).click();
    const editor=await spawnedPage(previousProjectPages);
    expect(new URL(editor.url()).searchParams.get('project')).toBe(created.project.id);
    await expect(editor.locator('.gs-workspace-shell')).toHaveAttribute('data-workspace','tags');
    await expect.poll(async()=>{try{await invoke(editor,'claim_project_document',{id:created.project.id});return true;}catch{return false;}}).toBe(true);
    let duplicateWriterRejected=false;
    try{await invoke(main,'claim_project_document',{id:created.project.id});}catch{duplicateWriterRejected=true;}
    expect(duplicateWriterRejected).toBe(true);
    const transferred=await invoke(editor,'open_project',{id:created.project.id});
    expect(transferred.project.quickForge).toEqual(created.project.quickForge);
    await expect(main.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();
    report.projectTransfer={nativeProjectPreserved:true,workspacePreserved:true,duplicateWriterRejected};
    await close(editor);
    expect(report.errors).toEqual([]);
  }
  report.complete = true;
} catch (error) {
  report.errors.push(String(error)); process.exitCode = 1;
  await main?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
  if (processHandle.exitCode === null) processHandle.kill();
  console.log(JSON.stringify({ complete: report.complete, windows: report.windows.length, simultaneousPopouts: report.simultaneousPopouts, guideLayout: report.guideLayout, errors: report.errors }));
}
