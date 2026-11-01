// Optional addition to the existing real three-process/native-tool harness.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect as assertion } from '@playwright/test';
const expect = assertion.configure({ timeout: 120000 }),
  run = promisify(execFile),
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export async function exerciseExternalTools({
  a,
  b,
  c,
  view,
  update,
  contentConverged,
  output,
  invader,
  baboonEditedTag,
}) {
  const evidence = {
    mockedIpc: false,
    simultaneousEditors: 3,
    externalTool: 'Invader',
    sharedSessionStayedConnected: true,
  };
  const panel = a.panel.locator('.studio-external-tools');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: 'Prepare tool fork', exact: true }).click();
  const file = panel.getByRole('textbox', { name: 'Shared external native tag', exact: true });
  await expect(file).toBeVisible();
  const forkId = await a.page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`guilty-spark-map-session-v1:${id}`))['studio.external.id'],
    a.id,
  );
  const fork = await a.call('studio_external_status', { projectId: a.id, id: forkId });
  const tag = path.join(fork.tagsDirectory, fork.tag);
  const before = await fs.readFile(tag),
    beforeView = await view(a);
  expect(hash(before)).toBe(fork.baselineSha256);
  await expect(b.call('studio_external_status', { projectId: b.id, id: forkId })).rejects.toThrow(
    /retained external|identity|another map/i,
  );
  await fs.writeFile(path.join(output, 'external-corrupt.weapon'), before.subarray(0, 20), { flag: 'wx' });
  await fs.writeFile(tag, before.subarray(0, 20));
  await expect(a.call('studio_external_review', { projectId: a.id, id: forkId })).rejects.toThrow(
    /native reader|invalid|trunc|CRC/i,
  );
  expect((await view(a)).revision).toBe(beforeView.revision);
  await fs.writeFile(tag, before);
  evidence.corruptSaveRejected = true;
  evidence.corruptedCandidateRetained = true;
  const exe = path.join(invader, 'invader-edit.exe');
  evidence.externalExecutableSha256 = hash(await fs.readFile(exe));
  const damaged = Buffer.from(before);
  damaged[80] ^= 1;
  await fs.writeFile(tag, damaged);
  await fs.writeFile(path.join(output, 'external-bad-crc.weapon'), damaged, { flag: 'wx' });
  await expect(a.call('studio_external_review', { projectId: a.id, id: forkId })).rejects.toThrow(
    /CRC|checksum/i,
  );
  expect((await view(a)).revision).toBe(beforeView.revision);
  await fs.writeFile(tag, before);
  evidence.invalidCrcRejectedBeforeNativeNormalization = true;
  await run(exe, ['-t', fork.tagsDirectory, '-S', 'acceleration_scale', '2.5', fork.tag], {
    windowsHide: true,
    timeout: 30000,
  });
  await expect(a.call('studio_external_review', { projectId: a.id, id: forkId })).rejects.toThrow(
    /exactly.*intended|field change/i,
  );
  expect((await view(a)).revision).toBe(beforeView.revision);
  await fs.writeFile(tag, before);
  evidence.otherExposedFieldNotSilentlyMerged = true;
  const started = performance.now();
  await Promise.all([
    run(exe, ['-t', fork.tagsDirectory, '-S', 'bounding_radius', '0.375', fork.tag], {
      windowsHide: true,
      timeout: 30000,
    }),
    update(c, beforeView, (document) => {
      document.spawns[0].name = 'World edit while external native tool saves';
    }),
  ]);
  await expect(panel.getByRole('button', { name: 'Propose reviewed field edit', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Propose reviewed field edit', exact: true }).click();
  await expect.poll(async () => (await view(a)).document.native.fields[0]?.boundingRadius).toBe(0.375);
  let current = await view(a);
  await contentConverged(current);
  expect(current.document.spawns[0].name).toBe('World edit while external native tool saves');
  evidence.externalEditAndConcurrentWorldEditConverged = true;
  evidence.convergedRevision = current.revision;
  evidence.elapsedMs = performance.now() - started;
  evidence.forkId = forkId;
  evidence.candidateSha256 = hash(await fs.readFile(tag));
  const same = await a.call('studio_external_review', { projectId: a.id, id: forkId });
  expect(same.changed).toBe(false);
  evidence.alreadyCommittedEditDoesNotCreateAnotherTransaction = true;
  evidence.finalBoundingRadius = 0.375;
  if (baboonEditedTag) {
    // Replay the retained, genuinely human-edited C37 file. This is not a new
    // Baboon GUI session and must never be reported as one.
    const saved = await fs.readFile(baboonEditedTag),
      savedHash = hash(saved);
    expect(savedHash).toBe('6dc893d2375864e4648d45cd161d2e73a5b4ab18442fcb8d6fdb6a6e401d9d95');
    await panel.getByRole('button', { name: 'Prepare new tool fork', exact: true }).click();
    await expect
      .poll(() =>
        a.page.evaluate(
          (id) => JSON.parse(localStorage.getItem(`guilty-spark-map-session-v1:${id}`))['studio.external.id'],
          a.id,
        ),
      )
      .not.toBe(forkId);
    const newId = await a.page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`guilty-spark-map-session-v1:${id}`))['studio.external.id'],
      a.id,
    );
    expect(newId).not.toBe(forkId);
    const next = await a.call('studio_external_status', { projectId: a.id, id: newId });
    const candidate = path.join(next.tagsDirectory, next.tag);
    await fs.writeFile(candidate, saved);
    const result = await a.call('studio_external_review', { projectId: a.id, id: newId });
    expect(result.serialization).toBe('equivalentNativeSerialization');
    expect(result.boundingRadius).toBe(0.5);
    expect(hash(await fs.readFile(candidate))).toBe(savedHash);
    await expect(
      panel.getByRole('button', { name: 'Propose reviewed field edit', exact: true }),
    ).toBeEnabled();
    await panel.getByRole('button', { name: 'Propose reviewed field edit', exact: true }).click();
    await expect.poll(async () => (await view(a)).document.native.fields[0]?.boundingRadius).toBe(0.5);
    current = await view(a);
    await contentConverged(current);
    evidence.finalBoundingRadius = 0.5;
    evidence.baboonSavedFileReplay = {
      newGuiSession: false,
      priorHumanEditedSave: true,
      rawSha256: savedHash,
      rawFileRetainedUnchanged: true,
      serialization: result.serialization,
      convergedRevision: current.revision,
    };
    expect(hash(await fs.readFile(baboonEditedTag))).toBe(savedHash);
  }
  const stale = await a.call('studio_external_prepare', { projectId: a.id });
  const changed = await update(b, current, (document) => {
    document.native.fields[0].boundingRadius = 0.625;
  });
  await contentConverged(changed.result);
  await run(exe, ['-t', stale.tagsDirectory, '-S', 'bounding_radius', '0.75', stale.tag], {
    windowsHide: true,
    timeout: 30000,
  });
  await expect(a.call('studio_external_review', { projectId: a.id, id: stale.id })).rejects.toThrow(
    /conflict/i,
  );
  expect((await view(a)).revision).toBe(changed.result.revision);
  evidence.sameFieldConflictRejectedWithoutReplacingSource = true;
  await b.call('forge_session_reverse', {
    projectId: b.id,
    sessionId: b.session,
    operationId: crypto.randomUUID(),
    redo: false,
  });
  current = await view(a);
  await contentConverged(current);
  expect(current.document.native.fields[0].boundingRadius).toBe(evidence.finalBoundingRadius);
  expect(current.document.spawns[0].name).toBe('World edit while external native tool saves');
  evidence.participantUndoPreservesExternalAndOtherAuthorEdits = true;
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'viewer',
    revoke: false,
  });
  await expect(c.call('studio_external_prepare', { projectId: c.id })).rejects.toThrow(/viewer/i);
  await a.call('forge_session_role', {
    projectId: a.id,
    sessionId: a.session,
    participantId: c.author,
    role: 'editor',
    revoke: false,
  });
  evidence.viewerCannotCreateToolFork = true;
  await fs.writeFile(path.join(output, 'external-tool-interop.json'), JSON.stringify(evidence, null, 2), {
    flag: 'wx',
  });
  return evidence;
}
