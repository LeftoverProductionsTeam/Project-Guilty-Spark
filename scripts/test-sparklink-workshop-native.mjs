import { assertQaOutputPath } from './native-qa-storage.mjs';
import {openStudioMenu} from '../tests/ui/helpers/navigation.ts';
// Opt-in acceptance: three real desktop processes with isolated libraries.
// Private LAN and a real Radmin adapter on ONE PC do not prove cross-PC delivery.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import {beginQaStorage,waitForQaExit} from './native-qa-storage.mjs';
const expect = assertion.configure({ timeout: 45000 }),
  args = process.argv.slice(2);
if (args.length !== 5)
  throw Error(
    'test-sparklink-workshop-native <Spark exe> <fresh evidence root> <H1A kit> <source tags> <Invader>',
  );
const [app, root, kit, tags, invader] = args.map((p) => path.resolve(p));
await fs.mkdir(await assertQaOutputPath(root), { recursive: false });
await fs.copyFile(new URL(import.meta.url), path.join(root, 'harness.mjs'), fs.constants.COPYFILE_EXCL);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  fileHash = async (p) => hash(await fs.readFile(p));
const clone = (x) => structuredClone(x),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  actors = [],
  errors = [];
const receipt = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  appSha256: await fileHash(app),
  harnessSha256: await fileHash(new URL(import.meta.url)),
  physicalMachines: 1,
  nativeProcesses: 3,
  separateLibraries: 3,
  mockedIpc: false,
  gameLaunched: false,
  gameplayReplicationTested: false,
  crossComputerTested: false,
  steamRelayTested: false,
  complete: false,
  stages: {},
  latencies: [],
  memory: [],
};
const finishStorage=await beginQaStorage(root,{workflow:'sparklink-workshop',appSha256:receipt.appSha256});
async function mark(key, value = true) {
  receipt.stages[key] = value;
  await fs.writeFile(path.join(root, 'progress.json'), JSON.stringify(receipt, null, 2));
  console.log(key, typeof value === 'object' ? JSON.stringify(value) : value);
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start(a, restart = false) {
  const port = await freePort();
  a.child = spawn(a.exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: a.data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(a.dir, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await finishStorage.trackProcess(a.child);
  await fs.writeFile(
    path.join(a.dir, restart ? 'restarted-process.json' : 'process.json'),
    JSON.stringify({ pid: a.child.pid, port }),
  );
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  a.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      a.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  a.page = a.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  a.page.on('pageerror', (e) => errors.push({ actor: a.slug, error: String(e) }));
  a.call = (command, params = {}) =>
    a.page.evaluate(({ command, params }) => window.__TAURI_INTERNALS__.invoke(command, params), {
      command,
      params,
    });
  const boot = await a.call('bootstrap');
  await a.call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: kit,
      hekTagsDirectory: tags,
      hekFlavor: 'h1aEk',
      invaderDirectory: invader,
    },
  });
  if (!restart) {
    const created = await a.call('create_quickforge_project', {
      title: `C48 Workshop ${a.slug}`,
      template: 'customBlank',
      target: 'mccSteam',
    });
    a.id = created.project.id;
    a.title = created.project.title;
  }
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  const scripts = await a.page.locator('script[src]').evaluateAll((nodes) => nodes.map((n) => n.src));
  const debuggerSession = await a.page.context().newCDPSession(a.page),
    parsed = [];
  debuggerSession.on('Debugger.scriptParsed', (event) => parsed.push(event));
  await debuggerSession.send('Debugger.enable');
  const served = [];
  for (const url of scripts) {
    const script = parsed.find((script) => script.url === url);
    if (!script) throw Error('Native debugger did not return the loaded app source');
    const { scriptSource: code } = await debuggerSession.send('Debugger.getScriptSource', {
      scriptId: script.scriptId,
    });
    const file = path.join(process.env.SPARK_FRONTEND_DIST??'dist', new URL(url).pathname.replace(/^\//, ''));
    served.push({ file, sha256: hash(code), localSha256: await fileHash(file) });
    expect(hash(code)).toBe(await fileHash(file));
  }
  await debuggerSession.detach();
  await fs.writeFile(path.join(a.dir, 'served-source.json'), JSON.stringify(served, null, 2));
  if (restart) {
    await expect(a.page.getByLabel('Native BSP Workshop')).toBeVisible();
  }
  console.log('started', a.slug, a.child.pid);
}
async function actor(slug) {
  const dir = path.join(root, slug),
    data = path.join(dir, 'library');
  await finishStorage.createScratch(slug);
  await fs.mkdir(data, { recursive: true });
  const a = { slug, dir, data, exe: path.join(dir, 'GuiltySpark-C48-qa.exe') };
  actors.push(a);
  await fs.copyFile(app, a.exe, fs.constants.COPYFILE_EXCL);
  await start(a);
  return a;
}
async function panel(a) {
  if (!(await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).isVisible())) {
    await openStudioMenu(a.page);await a.page.getByRole('button', { name: /Live Studio ·/ }).click();
  }
  a.panel = a.page.locator('.studio-panel');
  await expect(a.panel).toBeVisible();
  if (!(await a.panel.evaluate((el) => el.open))) await a.panel.locator(':scope > summary').click();
}
async function status(a) {
  return a.call('forge_session_status', { projectId: a.id });
}
async function view(a) {
  return a.call('forge_session_poll', { projectId: a.id, sessionId: a.session });
}
async function host(a, address) {
  await panel(a);
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.slug);
  await expect
    .poll(async () =>
      a.panel
        .getByRole('combobox', { name: 'Session network', exact: true })
        .locator('option')
        .allTextContents(),
    )
    .toContainEqual(expect.stringContaining(address));
  await a.panel.getByRole('combobox', { name: 'Session network', exact: true }).selectOption(address);
  await a.panel.getByRole('button', { name: 'Host editing session', exact: true }).click();
  await openStudioMenu(a.page);await expect(a.page.getByRole('button', { name: 'Live Studio · Hosting', exact: true })).toBeVisible();
  const info = await status(a);
  a.session = info.sessionId;
  a.author = 'host';
  a.directory = info.directoryId;
  expect(info.view.encrypted && info.view.durable).toBe(true);
  await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).click();
  return info;
}
async function invitation(a, address) {
  return a.call('forge_session_invite', { projectId: a.id, sessionId: a.session, address, viewer: false });
}
async function join(a, text) {
  await panel(a);
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.slug);
  await a.panel.getByRole('textbox', { name: 'Private Spark invite', exact: true }).fill(text);
  await a.panel.getByRole('button', { name: 'Join private invite', exact: true }).click();
  await openStudioMenu(a.page);await expect(a.page.getByRole('button', { name: 'Live Studio · Connected', exact: true })).toBeVisible();
  const info = await status(a);
  expect(info.view.encrypted && info.view.durable).toBe(true);
  a.session = info.sessionId;
  a.author = info.view.authorId;
  await a.page.getByRole('button', { name: 'Close SparkLink', exact: true }).click();
  if (!(await a.page.getByLabel('Native BSP Workshop').isVisible()))
    await a.page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
}
async function leave(a) {
  await a.call('forge_session_leave', { projectId: a.id, sessionId: a.session });
  // Reload the actual app to retire its session refs without mutating its document.
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
}
async function update(a, base, change, id = crypto.randomUUID()) {
  const document = clone(base.document);
  change(document);
  const next = await a.call('forge_session_update', {
    projectId: a.id,
    sessionId: a.session,
    revision: base.revision,
    document,
    operationId: id,
  });
  expect(next.acknowledgedOperationId).toBe(id);
  return { next, document, operationId: id, revision: base.revision };
}
async function converge(expected) {
  await expect
    .poll(
      async () => {
        const all = await Promise.all(actors.map(view));
        return all.every(
          (v) =>
            v.revision === expected.revision &&
            JSON.stringify(v.document) === JSON.stringify(expected.document),
        );
      },
      { intervals: [600] },
    )
    .toBe(true);
  const report = await actors[0].call('quickforge_validate', { document: expected.document });
  // Check actual React/native CSG consumption, not just backend transport caches.
  await Promise.all(
    actors.map(async (a) => {
      await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute(
        'data-source-sha',
        report.sourceSha256,
      );
      for (const b of expected.document.workshop.brushes)
        await expect(
          a.page
            .locator('.bsp-source-list')
            .getByRole('button', { name: `${b.role === 'space' ? '◇' : '◆'} ${b.name}`, exact: true }),
        ).toHaveCount(1);
    }),
  );
  return report;
}
async function save(a, expected) {
  await a.page.keyboard.press('Control+s');
  await expect
    .poll(async () => JSON.stringify((await a.call('open_project', { id: a.id })).project.quickForge))
    .toBe(JSON.stringify(expected));
}
async function select(a, index) {
  await a.page.locator('.bsp-source-list button').nth(index).click();
}
async function uiName(a, index, name) {
  const close = a.page.getByRole('button', { name: 'Close SparkLink', exact: true });
  if (await close.isVisible()) await close.click();
  await select(a, index);
  const input = a.page.locator('.bsp-source-fields').getByRole('textbox', { name: 'Volume name', exact: true });
  await input.fill(name);
  // Background native WebViews share one physical keyboard focus on this PC.
  // Trigger the real blur handler explicitly; no IPC/document mock is used.
  await input.evaluate((el) => el.blur());
  console.log(
    'ui-name',
    a.slug,
    name,
    await input.evaluate((el) => ({
      active: document.activeElement === el,
      value: el.value,
      focused: document.hasFocus(),
    })),
  );
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
}
async function memory(label) {
  const samples = [];
  for (const a of actors) {
    const cdp = await a.page.context().newCDPSession(a.page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const m = await cdp.send('Performance.getMetrics');
    samples.push({
      actor: a.slug,
      ...Object.fromEntries(
        m.metrics
          .filter((v) =>
            [
              'JSHeapUsedSize',
              'JSHeapTotalSize',
              'Nodes',
              'Documents',
              'TaskDuration',
              'LayoutDuration',
            ].includes(v.name),
          )
          .map((v) => [v.name, v.value]),
      ),
    });
    await cdp.detach();
  }
  receipt.memory.push({ label, elapsedMs: performance.now() - receipt.begin, samples });
}
async function crash(a) {
  const gone = new Promise((r) => a.child.once('exit', r));
  a.child.kill();
  await gone;
  await a.browser.close().catch(() => {});
  a.browser = null;
  a.child = null;
}
try {
  receipt.begin = performance.now();
  const a = await actor('owner'),
    b = await actor('editor-b'),
    c = await actor('editor-c');
  expect(new Set(actors.map((x) => x.child.pid)).size).toBe(3);
  expect(new Set(actors.map((x) => x.data)).size).toBe(3);
  await a.page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await a.page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('4 editable volumes');
  const details = a.page
    .locator('.bsp-source-fields details')
    .filter({ has: a.page.locator('summary', { hasText: 'Halo material paths & player starts' }) });
  await details.locator(':scope > summary').click();
  const shader = a.page.getByRole('textbox', { name: 'Shader path surface', exact: true });
  await shader.fill('levels/test/tutorial/shaders/example_tutorial_metal_floor');
  await shader.press('Tab');
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  // The deliberately minimal owned native tag set supplies the tutorial metal
  // shader. Explicitly author ALL surface definitions with it, including the
  // unused grass preview default; keep both material identities/dependencies.
  const grassShader = a.page.getByRole('textbox', { name: 'Shader path grass', exact: true });
  if (await grassShader.count()) {
    await grassShader.fill('levels/test/tutorial/shaders/example_tutorial_metal_floor');
    await grassShader.press('Tab');
    await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  }
  const sky = details.getByRole('textbox').last();
  await sky.fill('levels/test/bloodgulch/bloodgulch');
  await sky.press('Tab');
  await expect(a.page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  await details.locator(':scope > summary').click();
  const portals = a.page
    .locator('.bsp-source-fields details')
    .filter({ has: a.page.locator('summary', { hasText: 'Doorway portal' }) });
  await portals.locator('summary').click();
  await a.page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('1 authored portals');
  const door = a.page.getByRole('spinbutton', { name: 'Doorway X', exact: true });
  await door.fill('20');
  await door.press('Tab');
  await a.page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
  await expect(a.page.locator('.bsp-workshop footer')).toContainText('2 authored portals');
  await portals.locator('summary').click();
  await a.page.keyboard.press('Control+s');
  const networks = await a.call('forge_session_networks');
  const lan = networks.find((n) => n.networkScope === 'private' && n.address !== '127.0.0.1'),
    vpn = networks.find((n) => n.networkScope === 'radminVpn');
  if (!lan || !vpn)
    throw Error("This acceptance requires this machine's active LAN and real Radmin adapters");
  receipt.networks = networks;
  await host(a, lan.address);
  const text = await invitation(a, lan.address);
  await join(b, text);
  await join(c, text);
  let current = await view(a);
  await converge(current);
  await mark('threeIndependentWorkshopEditors', {
    tls: true,
    durable: true,
    network: 'actual private LAN interface',
    participants: current.participants.length,
  });
  // Each creator makes a simultaneous genuine GUI edit to a different brush.
  const began = performance.now();
  await Promise.all([
    uiName(a, 0, 'Room A by owner'),
    uiName(b, 1, 'Room B by B'),
    uiName(c, 3, 'Ramp by C'),
  ]);
  await expect
    .poll(
      async () => {
        const v = await view(a);
        return [
          v.document.workshop.brushes[0].name,
          v.document.workshop.brushes[1].name,
          v.document.workshop.brushes[3].name,
        ];
      },
      { intervals: [600] },
    )
    .toEqual(['Room A by owner', 'Room B by B', 'Ramp by C']);
  current = await view(a);
  await converge(current);
  receipt.latencies.push({ kind: 'simultaneous actual UI edits', ms: performance.now() - began });
  await mark('simultaneousUiBrushEdits');
  // Ctrl+Z reverses only B, and Ctrl+Y restores B; A/C and portals survive.
  await b.page.getByLabel('top orthographic editing view').click({ position: { x: 25, y: 25 } });
  await b.page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await view(a)).document.workshop.brushes[1].name, { intervals: [650] })
    .not.toBe('Room B by B');
  current = await view(a);
  expect(current.document.workshop.brushes[0].name).toBe('Room A by owner');
  expect(current.document.workshop.brushes[3].name).toBe('Ramp by C');
  await b.page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await view(a)).document.workshop.brushes[1].name, { intervals: [650] })
    .toBe('Room B by B');
  current = await view(a);
  await converge(current);
  await mark('participantSpecificBspUndoRedo');
  // Real source recipes cross three independent native processes. This phase
  // checks collaboration, not radiosity or gameplay (accepted separately).
  const lightingBase=await view(a),recipe={skyPath:lightingBase.document.skyPath,quality:'draft',environment:{previewEnabled:true,skyColor:[0.05,0.1,0.13],ambientColor:[0.7,0.8,0.9],ambientIntensity:0.5,sunColor:[1,0.9,0.8],sunIntensity:2,sunAzimuth:-35,sunElevation:50,fogEnabled:false,fogColor:[0.3,0.4,0.5],fogNear:25,fogFar:180}};
  expect(recipe.skyPath).toBe('levels/test/bloodgulch/bloodgulch');
  current=(await update(a,lightingBase,d=>{d.nativeLighting=recipe;})).next;
  const acceptedLighting=clone(current.document.nativeLighting);
  await converge(current);
  current=(await update(b,current,d=>{d.workshop.brushes[1].name='Room B after lighting';})).next;
  const peerBrush=clone(current.document.workshop.brushes[1]);
  current=await a.call('forge_session_reverse',{projectId:a.id,sessionId:a.session,operationId:crypto.randomUUID(),redo:false});
  expect(current.document.nativeLighting).toBeUndefined();
  expect(current.document.workshop.brushes[1]).toEqual(peerBrush);await converge(current);
  current=await a.call('forge_session_reverse',{projectId:a.id,sessionId:a.session,operationId:crypto.randomUUID(),redo:true});
  expect(current.document.nativeLighting).toEqual(acceptedLighting);
  expect(current.document.workshop.brushes[1]).toEqual(peerBrush);await converge(current);
  const beforeCompeting=current;
  current=(await update(c,current,d=>{d.nativeLighting.environment.ambientIntensity=0.75;})).next;
  await expect(update(a,beforeCompeting,d=>{delete d.nativeLighting;})).rejects.toThrow(/nativeLighting|conflict/i);
  expect((await view(a)).document).toEqual(current.document);await converge(current);
  current=(await update(a,current,d=>{delete d.nativeLighting;})).next;
  expect(current.document.nativeLighting).toBeUndefined();await converge(current);
  await Promise.all(actors.map(x=>save(x,current.document)));
  for(const x of actors){
    await expect.poll(async()=>(await x.call('read_workspace_history',{projectId:x.id})).history?.head.dirty).toBe(false);
    const savedHistory=(await x.call('read_workspace_history',{projectId:x.id})).history;
    for(const snapshot of savedHistory.snapshots){const doc=snapshot.project.quickForge;if(doc?.nativeLighting)expect(doc.nativeLighting.skyPath).toBe(doc.skyPath);}
    expect((await x.page.locator('[role="alert"]').allTextContents()).join(' ')).not.toMatch(/History snapshot.*refused/i);
  }
  await mark('nativeLightingRecipeAuthorUndoAndConflict',{independentProcesses:3,optionalRemoval:true,peerBrushPreserved:true,competingRecipeRefused:true,validSavedUndoSnapshots:true,nativeBakeTestedInThisStage:false});

  // A real held orthographic mouse drag emits wire ghosts without journal commits.
  await panel(b); // Close SparkLink overlay again if it covered the view.
  await openStudioMenu(b.page);await b.page.getByRole('button', { name: /Live Studio ·/ }).click();
  await b.page.getByRole('button', { name: 'Move', exact: true }).click();
  const top = b.page.getByLabel('top orthographic editing view'),
    bounds = await top.boundingBox();
  // The corridor ceiling is exposed. The ramp is behind Room A's source
  // ceiling in top view and must not be selected through that nearer face.
  const target = top.locator('[data-brush="corridor"][data-face="face-1"]');
  const pt = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const beforePreview = await view(a);
  await b.page.mouse.move(pt.x, pt.y);
  await b.page.mouse.down();
  await b.page.mouse.move(pt.x + bounds.width / 144, pt.y, { steps: 8 });
  await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '1');
  await expect(c.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '1');
  const preview = await view(a);
  expect(preview.revision).toBe(beforePreview.revision);
  expect(preview.acknowledgedOperations).toBe(beforePreview.acknowledgedOperations);
  expect(preview.workshopPreviews).toHaveLength(1);
  expect(preview.workshopPreviews[0].brush.brushId).toBe('corridor');
  await expect(a.page.locator('svg [data-workshop-preview="corridor"]')).toHaveCount(3);
  await a.page.screenshot({ path: path.join(root, 'peer-drag-preview.png') });
  await b.page.mouse.up();
  await expect(a.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '0');
  await expect(c.page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-workshop-preview-count', '0');
  await expect
    .poll(
      async () => (await view(a)).document.workshop.brushes.find((brush) => brush.id === 'corridor').position[0],
      { intervals: [500] },
    )
    .toBe(beforePreview.document.workshop.brushes.find((brush) => brush.id === 'corridor').position[0] + 0.5);
  current = await view(a);
  expect(current.revision).toBe(beforePreview.revision + 1);
  await converge(current);
  // Restore the source with its actual author Undo before frozen compilation.
  await b.page.keyboard.press('Control+z');
  await expect.poll(async()=>(await view(a)).document.workshop.brushes.find(brush=>brush.id==='corridor').position[0]).toBe(beforePreview.document.workshop.brushes.find(brush=>brush.id==='corridor').position[0]);
  current=await view(a);await converge(current);
  await mark('actualMouseDragGhosts', {
    originalGeometryRestoredByAuthorUndo:true,
    perspectiveAndOrthographic: true,
    uncommittedRevisionUnchanged: true,
    clearedAfterGesture: true,
    actualGeometryCommittedAndRenderedByAllEditors: true,
  });
  // Concurrent shape/material conflicts are rejected; idempotent replay remains exactly once.
  let base = await view(a);
  const accepted = await update(b, base, (d) => {
    d.workshop.brushes[0].faces[0].uvOffset[0] = 0.125;
  });
  const duplicate = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: accepted.revision,
    document: accepted.document,
    operationId: accepted.operationId,
  });
  expect(duplicate.revision).toBe(accepted.next.revision);
  await expect(
    update(c, base, (d) => {
      for (const vertex of d.workshop.brushes[0].vertices) vertex[0] *= 1.05;
    }),
  ).rejects.toThrow(/conflict|another creator owns/i);
  await expect(
    update(c, base, (d) => {
      d.workshop.brushes = d.workshop.brushes.filter((x) => x.id !== 'room-a');
    }),
  ).rejects.toThrow(/conflict|another creator owns/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: false,
  });
  await expect.poll(async () => (await view(c)).role).toBe('viewer');
  await expect(c.page.locator('.bsp-source-fields > fieldset')).toHaveAttribute('disabled', '');
  await expect(
    c.page.locator('.bsp-source-fields').getByRole('textbox', { name: 'Volume name', exact: true }),
  ).toBeDisabled();
  await expect(
    c.call('forge_session_preview', {
      projectId: c.id,
      sessionId: c.session,
      revision: duplicate.revision,
      brush: { brushId: 'room-a', position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }),
  ).rejects.toThrow(/view(?:er|ing permission)/i);
  await expect(c.call('quickforge_build', { projectId: c.id })).rejects.toThrow(/owner/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'editor',
    revoke: false,
  });
  await mark('conflictsReplayViewerAndBuildPermissions');
  // Suspend only the isolated editor's JS. Its native identity/source remain
  // genuine; this tests lease expiry, not a real network or VPN outage.
  const paused = await c.page.context().newCDPSession(c.page);
  await paused.send('Debugger.enable');
  const didPause = new Promise((r) => paused.once('Debugger.paused', r));
  await paused.send('Debugger.pause');
  await didPause;
  await sleep(11500);
  await expect
    .poll(async () => (await view(a)).participants.find((p) => p.id === c.author)?.online)
    .toBe(false);
  await paused.send('Debugger.resume');
  await paused.detach();
  await expect
    .poll(async () => (await view(a)).participants.find((p) => p.id === c.author)?.online, {
      intervals: [650],
    })
    .toBe(true);
  expect((await status(c)).view.authorId).toBe(c.author);
  expect((await view(a)).participants).toHaveLength(3);
  await mark('expiredEditorLeaseReauthenticatesSameIdentity', {
    pausedNativeEditorJavaScriptMs: 11500,
    networkOutageSimulated: false,
  });
  current = await view(a);
  await converge(current);
  await Promise.all(actors.map((x) => save(x, current.document)));
  await memory('before sustained edits');
  const durationStart = performance.now();
  for (let i = 0; i < 240; i++) {
    const creator = actors[i % 3],
      brush = i % 3,
      src = await view(a),
      started = performance.now();
    const moved = await update(creator, src, (d) => {
      d.workshop.brushes[brush].name = `C48 ${creator.slug} ${i}`;
    });
    current = moved.next;
    if (i < 12 || i >= 228) {
      await converge(current);
      receipt.latencies.push({
        kind: i < 12 ? 'early sustained commits' : 'late sustained commits',
        ms: performance.now() - started,
      });
    } else if (i % 20 === 19) await converge(current);
    // Exercise a realistic steady source cadence, not a rate-limit bypass.
    await sleep(Math.max(0, 200 - (performance.now() - started)));
    if (i === 119) await memory('mid sustained edits');
  }
  await converge(current);
  await memory('after sustained edits');
  const sessionRoot = path.join(a.data, 'studio-sessions', a.directory);
  const head = JSON.parse(await fs.readFile(path.join(sessionRoot, 'head.json'), 'utf8')),
    journal = JSON.parse(await fs.readFile(path.join(sessionRoot, `state-${head.slot}.json`), 'utf8'));
  expect(journal.transactions.length).toBe(100);
  expect(journal.revision).toBe(current.revision);
  expect(Object.keys(journal.acknowledged).length).toBe(current.acknowledgedOperations);
  await mark('sustainedNativeBspEditing', {
    commits: 240,
    durationMs: performance.now() - durationStart,
    history: journal.transactions.length,
    revision: current.revision,
    acknowledgedOperations: current.acknowledgedOperations,
    journalBytes: (await fs.stat(path.join(sessionRoot, `state-${head.slot}.json`))).size,
  });
  // Frozen source native compilation while another creator continues editing.
  current = await view(a);
  await converge(current);
  await save(a, current.document);
  const buildStart = performance.now(),
    jobId = await a.call('quickforge_build', { projectId: a.id });
  const frozen = current;
  await sleep(200);
  current = (
    await update(c, current, (d) => {
      d.workshop.brushes[3].name = 'Changed during frozen native BSP build';
    })
  ).next;
  await converge(current);
  await save(a, current.document);
  let built;
  await expect
    .poll(
      async () => {
        const boot = await a.call('bootstrap'),
          failed = boot.logs.find((l) => l.jobId === jobId && ['failed', 'blocked'].includes(l.phase));
        if (failed) throw Error(failed.message);
        built = (await a.call('open_project', { id: a.id })).project.builds.find((x) => x.id === jobId);
        return built?.status;
      },
      { timeout: 300000, intervals: [1500, 3000] },
    )
    .toBe('validated');
  const binding = JSON.parse(
    await fs.readFile(path.join(a.data, 'jobs', jobId, 'studio-binding.json'), 'utf8'),
  );
  expect(binding.sessionRevision).toBe(frozen.revision);
  expect(binding.sessionId).toBe(a.session);
  const snapshot = JSON.parse(
    await fs.readFile(path.join(a.data, 'jobs', jobId, 'workspace', 'project.gsproject'), 'utf8'),
  );
  expect(snapshot.quickForge.workshop).toEqual(frozen.document.workshop);
  const reopened = await a.call('open_built_map', { projectId: a.id, buildId: jobId });
  expect(reopened.inspection.header.version).toBe(13);
  expect(reopened.inspection.mesh.indices.length).toBeGreaterThan(0);
  expect(reopened.inspection.tags.some((tag) => tag.class === 'sbsp')).toBe(true);
  await mark('frozenSharedBspNativeBuild', {
    jobId,
    durationMs: performance.now() - buildStart,
    sessionRevision: binding.sessionRevision,
    newerRevision: current.revision,
    cacheVersion: 13,
    compiledCollisionTriangles: reopened.inspection.mesh.indices.length / 3,
    cacheSha256: await fileHash(built.output),
    cacheBytes: (await fs.stat(built.output)).size,
    output: built.output,
    portals: snapshot.quickForge.workshop.portals.length,
    readbackTags: reopened.inspection.tags.length,
  });
  // Edit through the real UI after owner death, then edit again while the first
  // operation is unacknowledged. Rejoining must retain BOTH drafts and apply
  // each exactly once with the original author and operation identity.
  await Promise.all(actors.map((x) => save(x, current.document)));
  const priorAuthor = b.author,
    priorSession = a.session,
    beforeCrashRevision = current.revision;
  await crash(a);
  await uiName(b, 2, 'Recovered pending BSP source');
  let pending;
  await expect
    .poll(async () => {
      pending = await b.call('forge_studio_pending', { projectId: b.id });
      return pending?.document.workshop.brushes[2].name;
    })
    .toBe('Recovered pending BSP source');
  expect(pending.revision).toBe(beforeCrashRevision);
  expect(pending.sessionId).toBe(priorSession);
  await uiName(b, 3, 'Newer local draft kept during reconnect');
  const newerLocal = clone(pending.document);
  newerLocal.workshop.brushes[3].name = 'Newer local draft kept during reconnect';
  const localReport = await b.call('quickforge_validate', { document: newerLocal });
  await expect(b.page.getByLabel('Native BSP Workshop')).toHaveAttribute(
    'data-source-sha',
    localReport.sourceSha256,
  );
  expect(await b.call('forge_studio_pending', { projectId: b.id })).toEqual(pending);
  await save(b, newerLocal);
  await mark('twoGenuineOfflineUiEditsRetained', {
    operationId: pending.operationId,
    baseline: pending.revision,
    pendingSourceSha256: (await b.call('quickforge_validate', { document: pending.document })).sourceSha256,
    newerDraftSourceSha256: localReport.sourceSha256,
  });
  await start(a, true);
  await panel(a);
  const recovered = await a.call('forge_studio_recover', {
    projectId: a.id,
    directoryId: a.directory,
    address: lan.address,
    displayName: a.slug,
    transport: 'lan',
  });
  a.session = recovered.sessionId;
  expect(a.session).toBe(priorSession);
  expect(recovered.view.document).toEqual(current.document);
  expect(recovered.view.revision).toBe(current.revision);
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  for (const x of [b, c]) await leave(x);
  const recoveredInvite = await invitation(a, lan.address);
  await join(b, recoveredInvite);
  await join(c, recoveredInvite);
  expect(b.author).toBe(priorAuthor);
  await expect
    .poll(async () => {
      const next = await view(a);
      return [next.document.workshop.brushes[2].name, next.document.workshop.brushes[3].name];
    })
    .toEqual(['Recovered pending BSP source', 'Newer local draft kept during reconnect']);
  current = await view(a);
  expect(current.revision).toBe(beforeCrashRevision + 2);
  await converge(current);
  await expect.poll(() => b.call('forge_studio_pending', { projectId: b.id })).toBe(null);
  const again = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: pending.revision,
    document: pending.document,
    operationId: pending.operationId,
  });
  expect(again.acknowledgedOperationId).toBe(pending.operationId);
  expect(again.revision).toBe(current.revision);
  expect(again.document).toEqual(current.document);
  const recoveryHead = JSON.parse(await fs.readFile(path.join(sessionRoot, 'head.json'), 'utf8'));
  const recoveredJournal = JSON.parse(
    await fs.readFile(path.join(sessionRoot, `state-${recoveryHead.slot}.json`), 'utf8'),
  );
  const originalRows = recoveredJournal.transactions.filter((row) => row.id === pending.operationId);
  expect(originalRows).toHaveLength(1);
  expect(originalRows[0].author).toBe(priorAuthor);
  await mark('ownerProcessDeathRecoversSourceHistoryAndPendingIdentity', {
    originalOperationId: pending.operationId,
    author: priorAuthor,
    beforeRevision: beforeCrashRevision,
    afterRevision: current.revision,
    genuineOfflineUiEdits: 2,
    originalOperationAppliedOnce: true,
    newerLocalDraftPreserved: true,
  });
  // C59: roll a converged durable authority forward through the real UI. Fresh
  // invitations reset the bounded operation log; the old journal stays intact.
  await Promise.all(actors.map((x) => save(x, current.document)));
  const sealedSession=a.session,sealedDirectory=a.directory,sealedHead=await fs.readFile(path.join(sessionRoot,'head.json'));
  const rolloverBegan=performance.now();
  await panel(a);
  await a.page.evaluate(()=>{window.c59RolloverClicks=0;document.addEventListener('click',event=>{if(event.target.closest?.('button')?.textContent==='New session from this revision')window.c59RolloverClicks++;});});
  await expect(a.panel.getByRole('button',{name:'New session from this revision',exact:true})).toBeEnabled();
  await a.panel.getByRole('button',{name:'New session from this revision',exact:true}).click();
  await expect.poll(async()=> (await status(a)).sessionId).not.toBe(sealedSession);
  const rolled=await status(a);a.session=rolled.sessionId;a.directory=rolled.directoryId;
  expect(rolled.view.document).toEqual(current.document);expect(rolled.view.revision).toBe(0);expect(rolled.view.acknowledgedOperations).toBe(0);
  expect(await fs.readFile(path.join(sessionRoot,'head.json'))).toEqual(sealedHead);
  await expect(a.call('forge_session_invite',{projectId:a.id,sessionId:sealedSession,address:lan.address,viewer:false})).rejects.toThrow();
  const lineage=await a.call('forge_studio_history',{projectId:a.id});
  expect(lineage.find(row=>row.directoryId===a.directory)).toMatchObject({previousSessionId:sealedSession,previousRevision:current.revision});
  await expect(a.call('forge_studio_recover',{projectId:a.id,directoryId:sealedDirectory,address:lan.address,displayName:a.slug,transport:'lan'})).rejects.toThrow(/rolled over/i);
  await a.page.getByRole('button',{name:'Close SparkLink',exact:true}).click();
  for(const x of [b,c])await leave(x);
  const freshInvite=await invitation(a,lan.address);await join(b,freshInvite);await join(c,freshInvite);
  await converge(rolled.view);
  for(const x of actors)expect((await view(x)).canUndo).toBe(false);
  base=await view(a);
  await Promise.all([
    update(a,base,d=>{d.workshop.brushes[0].name='Rollover owner';}),
    update(b,base,d=>{d.workshop.brushes[1].name='Rollover editor B';}),
    update(c,base,d=>{d.workshop.brushes[2].name='Rollover editor C';}),
  ]);
  current=await view(a);expect(current.revision).toBe(3);await converge(current);
  await mark('durableRolloverReinvitesThreeProcessesWithoutChangingThePreviousJournal',{
    elapsedMs:performance.now()-rolloverBegan,previousSession:sealedSession,previousRevision:lineage.find(row=>row.directoryId===a.directory).previousRevision,
    session:rolled.sessionId,newBaselineRevision:0,convergedRevision:current.revision,oldJournalPreserved:true,newInvitationsRequired:true,sharedUndoStartsFresh:true,
  });
  await Promise.all(actors.map((x) => save(x, current.document)));
  for (const x of [b, c, a]) await leave(x);
  // Repeat actual endpoint traffic using the OS-identified Radmin interface.
  const hosted = await host(a, vpn.address);
  expect(hosted.networkScope).toBe('radminVpn');
  const vpnInvite = await invitation(a, vpn.address);
  await join(b, vpnInvite);
  await join(c, vpnInvite);
  base = await view(a);
  await Promise.all([
    update(a, base, (d) => {
      d.workshop.brushes[0].name = 'Radmin owner';
    }),
    update(b, base, (d) => {
      d.workshop.brushes[1].name = 'Radmin B';
    }),
    update(c, base, (d) => {
      d.workshop.brushes[2].name = 'Radmin C';
    }),
  ]);
  current = await view(a);
  await converge(current);
  expect(current.revision).toBe(3);
  await mark('radminInterfaceThreeProcessConvergence', {
    scope: 'Radmin adapter, same physical machine',
    crossComputer: false,
    remoteVpnTunnelTested: false,
    revision: current.revision,
  });
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: true,
  });
  await expect(view(c)).rejects.toThrow(/revoked/i);
  await mark('revokedParticipantCannotReconnect');
  for (const x of actors) await x.page.screenshot({ path: path.join(x.dir, 'final.png') });
  expect(errors).toEqual([]);
  receipt.pageErrors = errors;
  receipt.elapsedMs = performance.now() - receipt.begin;
  delete receipt.begin;
  receipt.complete = true;
  receipt.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS actual three-process shared Workshop editing, ghosts, sustained revisions, native compile and recovery',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.pageErrors = errors;
  for (const a of actors) {
    receipt.uiAlerts??={};
    receipt.uiAlerts[a.slug]=await a.page?.locator('[role="alert"]').allTextContents().catch(()=>[]);
    receipt.uiAlerts[a.slug+':notices']=await a.page?.locator('.notice.error').allTextContents().catch(()=>[]);
    receipt.uiAlerts[a.slug+':rolloverClicks']=await a.page?.evaluate(()=>window.c59RolloverClicks).catch(()=>null);
    await a.page?.screenshot({ path: path.join(a.dir, 'failure.png') }).catch(() => {});
  }
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  for (const a of actors) {
    for(const name of ['final.png','failure.png']){const source=path.join(a.dir,name),info=await fs.stat(source).catch(()=>null);if(info?.isFile()&&info.size<=4*1024**2){await fs.copyFile(source,path.join(root,`native-sparklink-${a.slug}.png`));break;}}
    await a.browser?.close().catch(() => {});
    a.child?.kill();
    if (a.child) await waitForQaExit(a.child);
  }
  await finishStorage(receipt.complete?'passed':'failed');
}
