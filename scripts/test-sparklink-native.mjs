// Opt-in: three actual Windows Spark processes, three isolated owned libraries.
// The Halo compiler is real; game clients, peers and custom binary transfers are not simulated.
import { chromium, expect as pwExpect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const expect = pwExpect.configure({ timeout: 45000 });
const args = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--root', '--kit', '--invader', '--map'].includes(process.argv[n]) ||
    !process.argv[n + 1] ||
    args.has(process.argv[n])
  )
    throw Error('Use unique app/root/kit/invader/map arguments');
  args.set(process.argv[n], path.resolve(process.argv[n + 1]));
}
if (args.size !== 5) throw Error('All five named arguments are required');
const root = args.get('--root'),
  output = path.join(root, 'run');
await fs.mkdir(output); // Fresh evidence directory; never overwrite a previous attempt.
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hashFile = async (f) => sha(await fs.readFile(f));
async function sourceInventory(root) {
  const hashes = {};
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Native QA source contains a link');
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        if (Object.keys(hashes).length >= 20000) throw Error('Native QA source inventory exceeds its bound');
        hashes[path.relative(root, file).replaceAll('\\', '/')] = await hashFile(file);
      }
    }
  }
  await visit(root);
  return hashes;
}
const clone = (x) => structuredClone(x);
const actors = [],
  errors = [],
  latencies = [];
const receipt = {
  schemaVersion: 1,
  nativeProcesses: 3,
  separateDataRoots: 3,
  physicalMachines: 1,
  transport: 'private TCP + TLS 1.3, invitation-pinned certificate',
  mockedIpc: false,
  gameLaunched: false,
  gameMemoryTouched: false,
  gamePeerReplicationTested: false,
  nativeTagSharingTested: false,
  binaryAssetTransferTested: false,
};
function mark(name, value = true) {
  receipt[name] = value;
  console.log(name, typeof value === 'object' ? JSON.stringify(value) : value);
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start(actor, restart = false) {
  const port = await freePort();
  const child = spawn(actor.exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: actor.data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(output, actor.slug, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  actor.child = child;
  await fs.writeFile(
    path.join(output, actor.slug, restart ? 'restarted-process.json' : 'process.json'),
    JSON.stringify({ pid: child.pid, port }),
  );
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  actor.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      actor.browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  actor.page = actor.browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  actor.page.setDefaultTimeout(30000);
  actor.page.on('pageerror', (e) => errors.push({ actor: actor.slug, error: String(e) }));
  actor.call = (command, a = {}) =>
    actor.page.evaluate(({ command, a }) => window.__TAURI_INTERNALS__.invoke(command, a), { command, a });
  const boot = await actor.call('bootstrap');
  await actor.call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: args.get('--kit'),
      hekFlavor: 'h1aEk',
      hekTagsDirectory: path.join(actor.data, 'jobs', actor.seed.jobId, 'workspace', 'tags'),
      invaderDirectory: args.get('--invader'),
    },
  });
  if (!restart) {
    const imported = await actor.call('import_paths', { paths: [args.get('--map')] });
    const own = imported.find((x) => x.inspection?.header.version === 13);
    if (!own) throw Error('A real owned MCC Halo 1 map is required');
    actor.map = {
      projectId: own.project.id,
      hash: own.project.source.sha256,
      vehicle: own.inspection.tags.find(
        (t) => t.class === 'vehi' && t.path.replaceAll('\\', '/').endsWith('vehicles/warthog/mp_warthog'),
      ),
    };
    if (!actor.map.vehicle) throw Error('Owned map must contain the multiplayer Warthog');
  }
  await actor.page.reload();
  await actor.page
    .locator('.map-card')
    .filter({ has: actor.page.getByRole('heading', { name: actor.fixture.title, exact: true }) })
    .click();
  await actor.call('claim_project_document', { id: actor.id });
  await actor.page.getByRole('button', { name: /Live Studio ·/ }).click();
  await expect(actor.page.locator('.forge-workspace')).toBeVisible();
  await expect(actor.page.locator('.studio-panel')).toBeVisible();
  const summary = actor.page.locator('.studio-panel > summary');
  if (!(await actor.page.locator('.studio-panel').evaluate((el) => el.open))) await summary.click();
  actor.panel = actor.page.locator('.studio-panel');
  await expect(actor.page.locator('.forge-viewport canvas')).toBeVisible();
  console.log('started', actor.slug, child.pid);
}
async function loadActor(slug, name) {
  const data = path.join(root, slug),
    dir = path.join(output, slug);
  const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
  const seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
  if (!fixture.nativeFixture || fixture.projectId !== seed.projectId || path.resolve(seed.library) !== data)
    throw Error('Only explicit isolated owned QA libraries are accepted');
  await fs.mkdir(dir);
  const actor = {
    slug,
    name,
    data,
    fixture,
    seed,
    id: fixture.projectId,
    exe: path.join(dir, 'GuiltySpark-SparkLink-qa.exe'),
  };
  await fs.copyFile(args.get('--app'), actor.exe, fs.constants.COPYFILE_EXCL);
  actors.push(actor);
  await start(actor);
  return actor;
}
async function status(a) {
  return a.call('forge_session_status', { projectId: a.id });
}
async function view(a) {
  return a.call('forge_session_poll', { projectId: a.id, sessionId: a.session });
}
async function update(a, base, change, operationId = crypto.randomUUID()) {
  const document = clone(base.document);
  change(document);
  const result = await a.call('forge_session_update', {
    projectId: a.id,
    sessionId: a.session,
    revision: base.revision,
    document,
    operationId,
  });
  expect(result.acknowledgedOperationId).toBe(operationId);
  return { result, operationId, document, revision: base.revision };
}
async function converged(expected) {
  await expect
    .poll(
      async () => {
        const rows = await Promise.all(actors.map(view));
        return rows.every(
          (x) =>
            x.revision === expected.revision &&
            JSON.stringify(x.document) === JSON.stringify(expected.document),
        );
      },
      { intervals: [650] },
    )
    .toBe(true);
  // Confirm the rendered React editor has consumed the shared document, not only the transport cache.
  for (const a of actors)
    for (const b of expected.document.geometry)
      await expect(a.page.locator('.forge-tree-select').filter({ hasText: b.name })).toHaveCount(1);
}
async function joinUi(a, invitation) {
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.name);
  await a.panel.getByRole('textbox', { name: 'Private Spark invite', exact: true }).fill(invitation);
  await a.panel.getByRole('button', { name: 'Join private invite', exact: true }).click();
  await expect(a.page.getByRole('button', { name: 'Live Studio · Connected', exact: true })).toBeVisible();
  const info = await status(a);
  expect(info.view.encrypted).toBe(true);
  expect(info.view.durable).toBe(true);
  a.session = info.sessionId;
  a.author = info.view.authorId;
}
async function leave(a) {
  await a.panel.getByRole('button', { name: 'Leave session', exact: true }).click();
  await expect(a.panel.getByRole('button', { name: 'Join private invite', exact: true })).toBeVisible();
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
  const a = await loadActor('owner', 'Creator A'),
    b = await loadActor('editor-b', 'Creator B'),
    c = await loadActor('editor-c', 'Creator C');
  expect(new Set(actors.map((x) => x.child.pid)).size).toBe(3);
  expect(new Set(actors.map((x) => x.data)).size).toBe(3);
  receipt.appSha256 = await hashFile(a.exe);
  const nativeSourceRoot = path.join(a.data, 'jobs', a.seed.jobId, 'workspace', 'tags');
  const originalNativeSource = await sourceInventory(nativeSourceRoot);
  const protectedCaches = await Promise.all(
    actors.map(async (x) => {
      const p = (await x.call('open_project', { id: x.id })).project;
      const original = p.builds.find((y) => y.id === x.fixture.workingBuildId);
      return { file: original.output, hash: await hashFile(original.output) };
    }),
  );
  await a.panel.getByRole('textbox', { name: 'Studio display name', exact: true }).fill(a.name);
  await a.panel.getByRole('textbox', { name: 'Studio bind address', exact: true }).fill('127.0.0.1');
  await a.panel.getByRole('button', { name: 'Host editing session', exact: true }).click();
  await expect(a.page.getByRole('button', { name: 'Live Studio · Hosting', exact: true })).toBeVisible();
  const hosted = await status(a);
  a.session = hosted.sessionId;
  a.author = 'host';
  expect(hosted.view.revision).toBe(0);
  expect(hosted.view.encrypted && hosted.view.durable).toBe(true);
  const invitation = await a.call('forge_session_invite', {
    projectId: a.id,
    sessionId: a.session,
    address: '127.0.0.1',
    viewer: false,
  });
  const unencrypted = await a.call('forge_session_parse_invite', { text: invitation });
  delete unencrypted.certificate;
  const legacyText = 'spark-session:' + Buffer.from(JSON.stringify(unencrypted)).toString('hex');
  await expect(
    b.call('forge_session_join', {
      projectId: b.id,
      endpoint: '',
      key: '',
      transport: 'lan',
      invite: legacyText,
      displayName: b.name,
    }),
  ).rejects.toThrow(/TLS certificate.*Advanced legacy/);
  expect((await view(a)).peers).toBe(1);
  mark('tlsLabelledJoinRefusesPlaintextInvitation', true);
  await joinUi(b, invitation);
  await joinUi(c, invitation);
  await expect.poll(async () => (await view(a)).peers, { intervals: [700] }).toBe(3);
  const base = await view(a);
  mark('threeNativeEditors', {
    participants: base.participants.map((p) => ({ name: p.name, role: p.role })),
    uiJoin: true,
    tls: true,
    durable: true,
  });
  const began = performance.now();
  const cover = {
    ...clone(base.document.geometry[0]),
    id: crypto.randomUUID(),
    name: 'Creator B cover',
    kind: 'box',
    position: [0, 0, 1.25],
    dimensions: [2, 2, 2],
    rotation: [0, 0, 0],
    steps: 4,
    heights: [],
  };
  const first = await Promise.all([
    update(b, base, (d) => {
      d.geometry.push(cover);
    }),
    update(c, base, (d) => {
      d.spawns[0].position[1] += 1;
      d.spawns[0].name = 'Creator C start';
    }),
    update(a, base, (d) => {
      d.materials[0].color = [0.3, 0.5, 0.7];
    }),
  ]);
  let current = await view(a);
  expect(current.revision).toBe(3);
  await converged(current);
  latencies.push(performance.now() - began);
  expect(current.document.geometry.find((x) => x.id === cover.id)).toEqual(cover);
  expect(current.document.spawns[0].name).toBe('Creator C start');
  mark('simultaneousIndependentChangesMerged', true);
  // Actual UI object selection and rename travels through React -> pending SQLite -> TLS -> journal.
  await b.page.getByRole('button', { name: 'Toggle Build tools', exact: true }).click();
  await b.page.locator('.forge-tree-select').filter({ hasText: 'Creator B cover' }).click();
  const rename = b.page.getByRole('textbox', { name: 'Selected object name', exact: true });
  await expect(rename).toBeVisible();
  await rename.fill('Creator B shared cover');
  await expect
    .poll(async () => (await view(a)).document.geometry.find((x) => x.id === cover.id)?.name, {
      intervals: [650],
    })
    .toBe('Creator B shared cover');
  current = await view(a);
  await converged(current);
  mark('genuineUiEditAcknowledged', true);
  // Undo is per author: C's spawn edit and A's material edit survive B's inverse transaction.
  await b.page.getByRole('button', { name: /Live Studio ·/ }).click();
  await b.page.locator('.forge-viewport canvas').click({ position: { x: 80, y: 80 } });
  await b.page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await view(a)).document.geometry.find((x) => x.id === cover.id)?.name, {
      intervals: [650],
    })
    .toBe('Creator B cover');
  current = await view(a);
  expect(current.document.spawns[0].name).toBe('Creator C start');
  expect(current.document.materials[0].color[2]).toBeCloseTo(0.7, 6);
  await b.page.keyboard.press('Control+Shift+z');
  await expect
    .poll(async () => (await view(a)).document.geometry.find((x) => x.id === cover.id)?.name, {
      intervals: [650],
    })
    .toBe('Creator B shared cover');
  mark('perAuthorUiUndoRedo', { ctrlZ: true, ctrlShiftZ: true, otherAuthorsRetained: true });
  current = await view(a);
  const vehicle = {
    id: crypto.randomUUID(),
    name: 'Shared owned Warthog',
    tagPath: a.map.vehicle.path.replaceAll('\\', '/'),
    tagClass: 'vehi',
    tagId: a.map.vehicle.id,
    sourceProjectId: null,
    sourceSha256: a.map.hash,
    position: [4, 4, 0.2],
    rotation: [0, 0, 0],
    team: 0,
    respawnSeconds: 30,
    visible: true,
    locked: false,
  };
  await update(a, current, (d) => d.placements.push(vehicle));
  current = await view(a);
  await converged(current);
  for (const x of actors) {
    await expect(x.page.locator('.forge-tree-select').filter({ hasText: vehicle.name })).toHaveCount(1);
    const p = (await x.call('open_project', { id: x.id })).project;
    // UI edits may be unsaved; native source ownership is checked by the preserved local map identity.
    expect(x.map.hash).toBe(a.map.hash);
    expect(p.id).toBe(x.id);
    await expect
      .poll(() => x.page.locator('.forge-model-evidence').getAttribute('data-placement-models'), {
        intervals: [700],
      })
      .toBe('1');
    expect(
      Number(await x.page.locator('.forge-model-evidence').getAttribute('data-model-triangles')),
    ).toBeGreaterThan(0);
    await x.page.getByRole('button', { name: 'Toggle Build tools', exact: true }).click();
    await x.page.locator('.forge-tree-select').filter({ hasText: vehicle.name }).click();
  }
  mark('ownedAssetReferenceShared', {
    nativePath: vehicle.tagPath,
    sameOwnedMapHash: true,
    sourceBytesTransferred: false,
    actualModelsResolvedInAllViewports: true,
  });
  for (let sample = 0; sample < 5; sample++) {
    const source = await view(a),
      began = performance.now(),
      editor = actors[sample % actors.length];
    const moved = await update(editor, source, (d) => {
      d.placements[0].position[0] = sample;
    });
    for (const x of actors)
      await expect
        .poll(
          () =>
            x.page
              .getByRole('spinbutton', { name: 'Position X', exact: true, includeHidden: true })
              .inputValue(),
          { intervals: [150, 300, 500] },
        )
        .toBe(String(sample));
    await converged(moved.result);
    latencies.push(performance.now() - began);
  }
  mark('realModelTransformsReachRenderedEditors', true);
  // Camera motions are native UI events. Only B's local camera should move.
  for (const x of actors) await x.page.getByRole('button', { name: /Live Studio ·/ }).click();
  const cameras = await Promise.all(
    actors.map((x) => x.page.locator('.forge-viewport canvas').getAttribute('data-gs-camera-pose')),
  );
  const canvas = b.page.locator('.forge-viewport canvas'),
    bounds = await canvas.boundingBox();
  await b.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await b.page.mouse.wheel(0, -200);
  await expect.poll(() => canvas.getAttribute('data-gs-camera-pose')).not.toBe(cameras[1]);
  const cameraAfter = await Promise.all(
    actors.map((x) => x.page.locator('.forge-viewport canvas').getAttribute('data-gs-camera-pose')),
  );
  expect(cameraAfter[0]).toBe(cameras[0]);
  expect(cameraAfter[2]).toBe(cameras[2]);
  mark('independentCameras', true);
  // Duplicate acknowledgement and same-cell/delete conflicts do not create silent overwrites.
  current = await view(a);
  const accepted = await update(b, current, (d) => {
    d.geometry.find((x) => x.id === cover.id).position[0] = 2;
  });
  const duplicate = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: accepted.revision,
    document: accepted.document,
    operationId: accepted.operationId,
  });
  expect(duplicate.revision).toBe(accepted.result.revision);
  await expect(
    update(c, current, (d) => {
      d.geometry.find((x) => x.id === cover.id).position[0] = -2;
    }),
  ).rejects.toThrow(/conflict/i);
  await expect(
    update(c, current, (d) => {
      d.geometry = d.geometry.filter((x) => x.id !== cover.id);
    }),
  ).rejects.toThrow(/conflict/i);
  mark('replayAndConflicts', {
    duplicateDidNotIncrement: true,
    sameFieldRejected: true,
    deleteVsEditRejected: true,
  });
  // Retain an unacknowledged draft, including after a WebView reload.
  current = await view(a);
  const pending = {
    sessionId: b.session,
    operationId: crypto.randomUUID(),
    revision: current.revision,
    document: { ...clone(current.document), name: 'retained-local-branch' },
  };
  await b.call('forge_studio_save_pending', { projectId: b.id, pending });
  await b.page.reload();
  await b.page
    .locator('.map-card')
    .filter({ has: b.page.getByRole('heading', { name: b.fixture.title, exact: true }) })
    .click();
  await b.call('claim_project_document', { id: b.id });
  await b.page.getByRole('button', { name: /Live Studio ·/ }).click();
  b.panel = b.page.locator('.studio-panel');
  expect(await b.call('forge_studio_pending', { projectId: b.id })).toEqual(pending);
  await expect(b.panel.getByText('Retained unacknowledged local edit', { exact: true })).toBeVisible();
  await b.call('forge_studio_clear_pending', { projectId: b.id, operationId: crypto.randomUUID() });
  expect((await b.call('forge_studio_pending', { projectId: b.id })).operationId).toBe(pending.operationId);
  await b.panel.getByText('Retained unacknowledged local edit', { exact: true }).click();
  await b.panel.getByRole('button', { name: 'Clear retained edit', exact: true }).click();
  await expect.poll(() => b.call('forge_studio_pending', { projectId: b.id })).toBeNull();
  const useShared = b.panel.getByRole('button', { name: 'Use shared version and resume', exact: true });
  if (await useShared.isVisible()) await useShared.click();
  mark('pendingDraftSurvivesUiReload', true);
  // Viewer and owner boundaries are real separate-process native calls.
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: false,
  });
  await expect.poll(async () => (await view(c)).role, { intervals: [650] }).toBe('viewer');
  current = await view(a);
  await expect(
    update(c, current, (d) => {
      d.name = 'viewer-must-not-write';
    }),
  ).rejects.toThrow(/viewer/i);
  await expect(
    c.call('forge_session_role', {
      projectId: c.id,
      sessionId: c.session,
      participantId: b.author,
      role: 'viewer',
      revoke: false,
    }),
  ).rejects.toThrow(/owner/i);
  await expect(c.call('quickforge_build', { projectId: c.id })).rejects.toThrow(/owner/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'editor',
    revoke: false,
  });
  mark('rolesAndHostBuildAuthority', true);
  // Build a frozen acknowledged source while another creator keeps changing the session.
  current = await view(a);
  // The owned seed already contains its previously compiled C33 namespace.
  // Preserve it and build genuinely new output under a fresh native scenario.
  await update(a, current, (d) => {
    d.name = `c39_sparklink_${crypto.randomUUID().slice(0, 8)}`;
  });
  current = await view(a);
  await converged(current);
  const source = (await a.call('open_project', { id: a.id })).project;
  source.quickForge = clone(current.document);
  source.quickForge.placements = source.quickForge.placements.map((p) => ({
    ...p,
    sourceProjectId: a.map.projectId,
  }));
  const geometry = await a.call('quickforge_validate', { document: source.quickForge });
  expect(geometry.valid).toBe(true);
  const unsupported = clone(source.quickForge);
  unsupported.geometry.find((x) => x.id === cover.id).position[2] = 1;
  const negative = await a.call('quickforge_validate', { document: unsupported });
  expect(negative.valid).toBe(false);
  expect(negative.issues.some((x) => x.code === 'BRUSH_OUTSIDE_ROOM')).toBe(true);
  mark('unsupportedShellContactStillRejected', true);
  await a.call('save_project', { project: source });
  const buildBegan = performance.now(),
    jobId = await a.call('quickforge_build', { projectId: a.id });
  const during = await update(c, current, (d) => {
    d.spawns[1].name = 'Edited while native Tool builds';
    d.spawns[1].position[0] -= 1;
  });
  expect(during.result.revision).toBeGreaterThan(current.revision);
  // Persist the newer host draft to exercise frozen-revision readback, not current-project readiness.
  const newer = (await a.call('open_project', { id: a.id })).project;
  newer.quickForge = clone(during.result.document);
  newer.quickForge.placements = newer.quickForge.placements.map((p) => ({
    ...p,
    sourceProjectId: a.map.projectId,
  }));
  await a.call('save_project', { project: newer });
  let built;
  await expect
    .poll(
      async () => {
        const boot = await a.call('bootstrap');
        const failed = boot.logs.find((e) => e.jobId === jobId && e.phase === 'failed');
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
  expect(binding.sessionRevision).toBe(current.revision);
  expect(binding.sessionId).toBe(a.session);
  const snapshot = JSON.parse(
    await fs.readFile(path.join(a.data, 'jobs', jobId, 'workspace', 'project.gsproject'), 'utf8'),
  );
  expect(snapshot.quickForge.spawns[1].name).toBe(current.document.spawns[1].name);
  expect(snapshot.quickForge.spawns[1].position).toEqual(current.document.spawns[1].position);
  const reopened = await a.call('open_built_map', { projectId: a.id, buildId: jobId });
  expect(reopened.inspection.header.version).toBe(13);
  const compiledVehicle = reopened.inspection.tags.find(
    (t) => t.class === 'vehi' && t.path.replaceAll('\\', '/').endsWith(vehicle.tagPath),
  );
  expect(compiledVehicle).toBeTruthy();
  expect(reopened.inspection.objects.some((o) => o.tagId === compiledVehicle.id)).toBe(true);
  const compiledStart = reopened.inspection.objects.find(
    (o) =>
      o.kind === 'Player spawn' &&
      Math.abs(o.position[1] - current.document.spawns[1].position[1]) < 0.001 &&
      Math.abs(o.position[0] - current.document.spawns[1].position[0]) < 0.001,
  );
  expect(compiledStart).toBeTruthy();
  expect(compiledStart.position[0]).not.toBe(during.result.document.spawns[1].position[0]);
  mark('nativeBuildSnapshot', {
    revision: binding.sessionRevision,
    editingContinuedAt: during.result.revision,
    durationMs: performance.now() - buildBegan,
    cacheSha256: built.sha256,
    cacheVersion: 13,
    frozenSnapshotOpened: true,
    gameplayTested: false,
  });
  current = await view(a);
  await converged(current);
  for (const x of actors) {
    await x.page.setViewportSize({ width: 1500, height: 920 });
    await x.page.getByRole('button', { name: /Live Studio ·/ }).click();
    await expect(x.panel.locator('.studio-people')).toBeVisible();
    await expect(x.panel.locator('.studio-people')).toContainText(x.name);
    await x.page.screenshot({ path: path.join(output, `sparklink-${x.slug}.png`) });
    expect(await x.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const localDocument = clone(current.document);
    localDocument.placements = localDocument.placements.map((p) => ({
      ...p,
      sourceProjectId: x.map.projectId,
    }));
    const mesh = await x.call('quickforge_preview', { document: localDocument });
    expect(mesh.positions.length).toBeGreaterThan(0);
  }
  mark('threeRenderedNativeViewports', true);
  await b.page.setViewportSize({ width: 1024, height: 640 });
  await b.page.screenshot({ path: path.join(output, 'sparklink-1024.png') });
  expect(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await b.page.setViewportSize({ width: 1500, height: 920 });
  // Abrupt host process death. The new process must recover exactly acknowledged work.
  await a.page.getByRole('button', { name: /Live Studio ·/ }).click();
  const history = await a.call('forge_studio_history', { projectId: a.id });
  const oldSession = a.session,
    oldRevision = current.revision,
    oldDoc = current.document;
  const recoveryBegan = performance.now();
  await crash(a);
  await start(a, true);
  await expect(a.panel.getByRole('button', { name: 'Host editing session', exact: true })).toBeVisible();
  const recovered = await a.call('forge_studio_recover', {
    projectId: a.id,
    directoryId: history[0].directoryId,
    address: '127.0.0.1',
    displayName: a.name,
  });
  expect(recovered.sessionId).toBe(oldSession);
  expect(recovered.view.revision).toBe(oldRevision);
  expect(recovered.view.document).toEqual(oldDoc);
  a.session = oldSession;
  const freshInvite = await a.call('forge_session_invite', {
    projectId: a.id,
    sessionId: a.session,
    address: '127.0.0.1',
    viewer: false,
  });
  expect(freshInvite).not.toBe(invitation);
  // Remount controllers after the native recovery (the recovery API above is real, not a mock).
  await a.page.reload();
  await a.page
    .locator('.map-card')
    .filter({ has: a.page.getByRole('heading', { name: a.fixture.title, exact: true }) })
    .click();
  await a.call('claim_project_document', { id: a.id });
  await a.page.getByRole('button', { name: /Live Studio ·/ }).click();
  a.panel = a.page.locator('.studio-panel');
  for (const x of [b, c]) {
    await leave(x);
    await joinUi(x, freshInvite);
  }
  expect(b.author).toBe(first[0].result.authorId);
  expect(c.author).toBe(first[1].result.authorId);
  const replayRecovered = await b.call('forge_session_update', {
    projectId: b.id,
    sessionId: b.session,
    revision: accepted.revision,
    document: accepted.document,
    operationId: accepted.operationId,
  });
  expect(replayRecovered.revision).toBe(oldRevision);
  await converged(recovered.view);
  mark('actualProcessCrashRecovery', {
    sourceAndRevisionIntact: true,
    sameSessionIdentity: true,
    authorIdentitiesRetained: true,
    oldOperationReplayDeduplicated: true,
    freshInvitation: true,
    durationMs: performance.now() - recoveryBegan,
  });
  // Revocation closes only that participant, rotates join invitations and retains all source.
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: true,
  });
  await expect(view(c)).rejects.toThrow(/revok|participant|credential/i);
  expect((await view(b)).document).toEqual(oldDoc);
  mark('revocationKeepsOtherCreatorsAndSource', true);
  for (const protectedFile of protectedCaches)
    expect(await hashFile(protectedFile.file)).toBe(protectedFile.hash);
  mark('originalOwnedCachesUnchanged', true);
  expect(await sourceInventory(nativeSourceRoot)).toEqual(originalNativeSource);
  mark('nativeSourceUnchanged', {
    files: Object.keys(originalNativeSource).length,
    everyFileByteIdentical: true,
  });
  mark('measuredPropagationMs', {
    samples: latencies.length,
    values: latencies,
    includesNativeIpcAndUiConvergence: true,
  });
  expect(errors).toEqual([]);
  receipt.pageErrors = errors;
  await fs.writeFile(path.join(output, 'sparklink-native-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('PASS SparkLink three-process native acceptance');
} catch (error) {
  for (const a of actors)
    if (a.page) await a.page.screenshot({ path: path.join(output, `failure-${a.slug}.png`) }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ ...receipt, error: String(error), stack: error.stack, pageErrors: errors }, null, 2),
  );
  throw error;
} finally {
  for (const a of actors) {
    // An unsaved native close dialog can intentionally leave IPC pending. The
    // harness owns these isolated processes and always releases them on failure.
    if (a.call && a.child)
      await Promise.race([
        a.call('request_close_window').catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    if (a.child?.exitCode === null) a.child.kill();
    if (a.browser)
      await Promise.race([a.browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }
}
