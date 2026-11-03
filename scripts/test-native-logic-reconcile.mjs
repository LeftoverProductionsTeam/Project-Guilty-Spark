// Real native IPC + installed Invader + Halo Tool, using the preserved UI-authored benchmark.
// Deliberate QA corruption is never attributed to Baboon or Invader.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const expect = assertion.configure({ timeout: 45000 }),
  a = process.argv.slice(2);
const resumeSession =
  a.length === 8 && a[6] === '--resume-prepared' && /^[a-f0-9-]{36}$/.test(a[7]) ? a[7] : null;
const resumeBuild =
  a.length === 8 && a[6] === '--resume-build'
    ? JSON.parse(await fs.readFile(path.resolve(a[7]), 'utf8'))
    : null;
if (a.length !== 6 && !resumeSession && !resumeBuild)
  throw Error(
    'test-native-logic-reconcile <Spark exe> <authoring acceptance.json> <fresh output> <H1A kit> <Invader> <Baboon> [--resume-prepared session-uuid | --resume-build failed-acceptance.json]',
  );
const [app, input, output, kit, invader, baboon] = a.slice(0, 6).map((p) => path.resolve(p));
const authoring = JSON.parse(await fs.readFile(input, 'utf8'));
if (
  !authoring.complete ||
  authoring.mockedIpc !== false ||
  !authoring.triggerTransformUndo ||
  !authoring.nativeBuild?.build?.output
)
  throw Error('Requires completed real native authoring acceptance');
const data = path.join(path.dirname(input), 'library');
await fs.mkdir(output, { recursive: false });
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  readHash = async (p) => hash(await fs.readFile(p));
const parentPath = authoring.nativeBuild.build.output;
expect(await readHash(parentPath)).toBe(authoring.nativeOutputSha256);
const receipt = {
  schemaVersion: 1,
  projectId: authoring.projectId,
  mockedIpc: false,
  complete: false,
  baboonGuiEdited: false,
  gameplayAccepted: false,
  appSha256: await readHash(app),
  parentSha256: authoring.nativeOutputSha256,
};
if (resumeBuild) {
  if (
    resumeBuild.mockedIpc !== false ||
    resumeBuild.projectId !== receipt.projectId ||
    resumeBuild.parentSha256 !== receipt.parentSha256 ||
    !resumeBuild.reconciled?.accepted ||
    !resumeBuild.invalidReconcileRejected ||
    !resumeBuild.nativeNoOp?.semanticIdentity ||
    resumeBuild.semanticDifferences?.length !== 1 ||
    !resumeBuild.resumedPreparedSession
  )
    throw Error(
      'Rebuild resume requires preserved genuine corruption, semantic edit and accepted native revision evidence',
    );
  const currentApp = receipt.appSha256;
  Object.assign(receipt, resumeBuild, {
    appSha256: currentApp,
    externalChecksAppSha256: resumeBuild.appSha256,
    previousAttempt: path.resolve(a[7]),
    resumedBuild: true,
    error: undefined,
    stack: undefined,
    pageErrors: [],
    complete: false,
  });
}
const executable = path.join(output, 'GuiltySpark-reconcile-qa.exe');
await fs.copyFile(app, executable, fs.constants.COPYFILE_EXCL);
const socket = net.createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const child = spawn(executable, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: data,
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
await fs.writeFile(
  path.join(output, 'owned-process.json'),
  JSON.stringify({ pid: child.pid, port }, null, 2),
);
const run = promisify(execFile),
  errors = [];
let browser, page, call;
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
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      hekDirectory: kit,
      hekFlavor: 'h1aEk',
      invaderDirectory: invader,
      autoBuild: false,
    },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.locator('h3').filter({ hasText: /^C63 native Logic benchmark$/ }) })
    .click({ timeout: 120000 });
  await call('claim_project_document', { id: receipt.projectId });
  const project = (await call('open_project', { id: receipt.projectId })).project;
  expect(project.quickForge.logic.rules).toHaveLength(1);
  const built = await call('open_built_map', {
    projectId: project.id,
    buildId: authoring.nativeBuild.build.id,
  });
  const door = built.inspection.tags.find(
    (t) => t.class === 'mach' && t.path.replaceAll('\\', '/').endsWith('door small/door small'),
  );
  expect(door).toBeTruthy();
  expect(built.inspection.scripts.map((s) => s.name)).toEqual(
    expect.arrayContaining(authoring.nativeScriptNames),
  );
  let directory;
  if (resumeBuild) {
    directory = path.join(data, 'jobs', `baboon-${receipt.resumedPreparedSession}`);
    const journal = JSON.parse(await fs.readFile(path.join(directory, 'handoff.json'), 'utf8'));
    expect(journal.projectId).toBe(project.id);
    expect(journal.parentBuildId).toBe(authoring.nativeBuild.build.id);
    expect(journal.revisions).toContain(path.basename(path.dirname(receipt.reconciled.source)));
    const plan = await call('prepare_runtime_tool', {
      runtimeId: 'mccSteam',
      projectId: project.id,
      actionId: 'editTags',
    });
    expect(await fs.realpath(plan.tagsDirectory)).toBe(await fs.realpath(receipt.reconciled.source));
    const file = path.join(directory, 'HCEEK', 'tags', ...journal.selectedTag.split('/')),
      accepted = path.join(receipt.reconciled.source, ...journal.selectedTag.split('/'));
    const valid = await fs.readFile(file);
    expect(hash(valid)).toBe(await readHash(accepted));
    const poll = () => call('baboon_poll', { projectId: project.id, sessionId: journal.id });
    await poll();
    const bad = Buffer.alloc(12),
      began = performance.now();
    try {
      await fs.writeFile(file, bad);
      await expect
        .poll(async () => (await poll()).integrity.invalidFiles, { timeout: 60000, intervals: [500, 1000] })
        .toBeGreaterThan(0);
      let rejected = '';
      try {
        await call('baboon_reconcile', { projectId: project.id, sessionId: journal.id });
      } catch (e) {
        rejected = String(e);
      }
      expect(rejected).toMatch(/integrity check failed/);
      receipt.postFixCorruptionRetest = { rejected: true, elapsedMs: performance.now() - began };
    } finally {
      const observed = await fs.readFile(file);
      if (!observed.equals(bad) && !observed.equals(valid))
        throw Error('Another save changed the QA file; never overwrite it with recovery bytes');
      if (observed.equals(bad)) await fs.writeFile(file, valid);
    }
    await expect
      .poll(
        async () => {
          const p = await poll();
          return (
            p.integrity.invalidFiles === 0 && p.integrity.pendingFiles === 0 && p.changes.status !== 'saving'
          );
        },
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    expect(await readHash(accepted)).toBe(hash(valid));
    console.log(
      'Resuming verified accepted native revision; new application still rejects the corrupted external save.',
    );
  } else {
    await call('baboon_register', { directory: baboon });
    let prepared;
    if (resumeSession) {
      const prior = JSON.parse(
        await fs.readFile(path.join(data, 'jobs', `baboon-${resumeSession}`, 'handoff.json'), 'utf8'),
      );
      expect(prior.id).toBe(resumeSession);
      expect(prior.projectId).toBe(project.id);
      expect(prior.parentBuildId).toBe(authoring.nativeBuild.build.id);
      expect(prior.revisions).toHaveLength(0);
      prepared = { sessionId: prior.id, tag: prior.selectedTag };
      receipt.resumedPreparedSession = prior.id;
      console.log('Resuming the unchanged prepared handoff; retaining the previous failed attempt.');
    } else {
      console.log('Preparing isolated native handoff with immutable baseline.');
      prepared = await call('baboon_prepare', { projectId: project.id, tagId: door.id });
    }
    directory = path.join(data, 'jobs', `baboon-${prepared.sessionId}`);
    const tags = path.join(directory, 'HCEEK', 'tags'),
      file = path.join(tags, ...prepared.tag.split('/'));
    // Invader's Windows file APIs need the native extended path for imported
    // namespaced tags whose complete path exceeds MAX_PATH. Keep the real path,
    // exact native tag name and isolation; do not rename or omit dependencies.
    const nativeTags = path.toNamespacedPath(tags);
    const original = await fs.readFile(file),
      originalHash = hash(original),
      editor = path.join(invader, 'invader-edit.exe');
    const initial = JSON.parse(await fs.readFile(path.join(directory, 'handoff.json'), 'utf8'));
    expect(initial.initialBaseline[prepared.tag]).toBe(originalHash);
    const poll = () => call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId });
    const reconcile = () =>
      call('baboon_reconcile', { projectId: project.id, sessionId: prepared.sessionId });
    const get = async (field) =>
      Number(
        (
          await run(editor, ['-t', nativeTags, '-G', field, prepared.tag], {
            windowsHide: true,
            timeout: 30000,
          })
        ).stdout.trim(),
      );
    receipt.originalBoundingRadius = await get('bounding_radius');
    await poll(); // Start the real watcher before an external write.
    const list = async () =>
      (
        await run(editor, ['-t', nativeTags, '-L', prepared.tag], {
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        })
      ).stdout.replaceAll('\r\n', '\n');
    const unchangedSemantics = await list();
    await run(
      editor,
      ['-t', nativeTags, '-S', 'bounding_radius', String(receipt.originalBoundingRadius), prepared.tag],
      { windowsHide: true, timeout: 30000 },
    );
    expect(await list()).toBe(unchangedSemantics);
    await expect
      .poll(
        async () => {
          const p = await poll();
          return (
            p.integrity.invalidFiles === 0 && p.integrity.pendingFiles === 0 && p.changes.status !== 'saving'
          );
        },
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    receipt.nativeNoOp = {
      semanticIdentity: true,
      byteIdentical: (await readHash(file)) === originalHash,
      scope: 'Actual Invader same-field save; a harmless rewrite is not classified as semantic corruption.',
    };
    const bad = Buffer.alloc(12);
    await fs.writeFile(path.join(output, 'injected-invalid-save.device_machine'), bad);
    const corruptAt = performance.now();
    await fs.writeFile(file, bad);
    let corrupt;
    await expect
      .poll(
        async () => {
          corrupt = await poll();
          return corrupt.integrity.invalidFiles;
        },
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBeGreaterThan(0);
    receipt.invalidDetectionMs = performance.now() - corruptAt;
    receipt.invalidObservation = corrupt;
    receipt.injectedWriter = 'QA fixture, not Baboon or Invader';
    let rejection = '';
    try {
      await reconcile();
    } catch (e) {
      rejection = String(e);
    }
    expect(rejection).toMatch(/integrity check failed/);
    receipt.invalidReconcileRejected = rejection;
    expect(await readHash(parentPath)).toBe(receipt.parentSha256);
    expect(await readHash(path.join(directory, 'baseline', ...prepared.tag.split('/')))).toBe(originalHash);
    await fs.writeFile(file, original);
    await expect
      .poll(
        async () => {
          const p = await poll();
          return (
            p.integrity.invalidFiles === 0 && p.integrity.pendingFiles === 0 && p.changes.status !== 'saving'
          );
        },
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    const before = (
      await run(editor, ['-t', nativeTags, '-L', prepared.tag], {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout
      .replaceAll('\r\n', '\n')
      .split('\n');
    const expected = 0.5,
      editedAt = performance.now();
    await run(editor, ['-t', nativeTags, '-S', 'bounding_radius', String(expected), prepared.tag], {
      windowsHide: true,
      timeout: 30000,
    });
    expect(await get('bounding_radius')).toBeCloseTo(expected, 6);
    const after = (
      await run(editor, ['-t', nativeTags, '-L', prepared.tag], {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout
      .replaceAll('\r\n', '\n')
      .split('\n');
    receipt.semanticDifferences = before.flatMap((line, i) =>
      line === after[i] ? [] : [{ before: line, after: after[i] }],
    );
    expect(receipt.semanticDifferences).toHaveLength(1);
    expect(receipt.semanticDifferences[0].after).toContain('bounding_radius');
    let saved;
    await expect
      .poll(
        async () => {
          saved = await poll();
          return (
            saved.changes.status !== 'saving' &&
            saved.integrity.pendingFiles === 0 &&
            saved.changes.changedFiles > 0
          );
        },
        { timeout: 60000, intervals: [500, 1000] },
      )
      .toBe(true);
    expect(saved.integrity.invalidFiles).toBe(0);
    receipt.validDetectionMs = performance.now() - editedAt;
    receipt.validObservation = saved;
    receipt.invaderSha256 = await readHash(editor);
    receipt.reconciled = await reconcile();
    expect(receipt.reconciled.accepted).toBe(true);
  }
  // A generated rebuild must not silently discard accepted third-party edits.
  let guarded = '';
  try {
    await call('quickforge_export', { projectId: project.id });
  } catch (e) {
    guarded = String(e);
  }
  expect(guarded).toMatch(/native|working|revis|regenerat/i);
  receipt.regenerationGuard = guarded;
  const began = performance.now(),
    jobId = await call('build_working_tags', { projectId: project.id, bspAudio: null });
  console.log('Compiling accepted external tag revision with original Logic sources.', jobId);
  let compiled;
  await expect
    .poll(
      async () => {
        const b = await call('bootstrap'),
          failed = b.logs.find((e) => e.jobId === jobId && e.phase === 'failed');
        if (failed) throw Error(failed.message);
        compiled = (await call('open_project', { id: project.id })).project.builds.find(
          (b) => b.id === jobId,
        );
        return compiled?.status;
      },
      { timeout: 900000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  receipt.nativeBuildMs = performance.now() - began;
  receipt.build = compiled;
  const result = await call('open_built_map', { projectId: project.id, buildId: compiled.id });
  const editedDoor = result.inspection.tags.find((t) => t.class === 'mach' && t.path === door.path);
  const radius = editedDoor?.fields.find((f) => f.label === 'Bounding radius' || f.key === 'bounding_radius');
  expect(radius?.value).toBeCloseTo(0.5, 6);
  receipt.compiledBoundingRadius = radius.value;
  expect(result.inspection.scripts.map((s) => s.name)).toEqual(
    expect.arrayContaining(authoring.nativeScriptNames),
  );
  receipt.compiledScripts = result.inspection.scripts;
  const journal = JSON.parse(await fs.readFile(path.join(directory, 'handoff.json'), 'utf8'));
  for (const [relative, expectedHash] of Object.entries(journal.initialBaseline))
    expect(await readHash(path.join(directory, 'baseline', ...relative.split('/')))).toBe(expectedHash);
  receipt.startingInventoryVerified = Object.keys(journal.initialBaseline).length;
  expect(await readHash(parentPath)).toBe(receipt.parentSha256);
  expect(project.quickForge.logic).toEqual(
    (await call('open_project', { id: project.id })).project.quickForge.logic,
  );
  expect(errors).toEqual([]);
  receipt.pageErrors = errors;
  receipt.complete = true;
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS injected corruption rejected, original source preserved, real Invader edit reconciled and native compiled with Logic scripts. No Baboon GUI or gameplay acceptance claimed.',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.pageErrors = errors;
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify(receipt, null, 2));
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
