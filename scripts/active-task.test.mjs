import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCheckpoint, writeCheckpoint } from './active-task.mjs';
const fixture = (status) =>
  `Task: C66 P0\nStatus: ${status}\nStarting revision: abc\nLatest verified revision: abc\nNext action: Inspect the existing native receipt before retrying.\n## Acceptance\nNative checks remain open.\n## Verified milestones\nSource preserved.\n## Changed work\nUncommitted storage repair.\n## Failures and blockers\nNo human traversal retest.\n## Operations and safe checkpoint\nVerify actual processes.\n## Deferred requests\nNone received.\n`;
test('unfinished implementation and automated acceptance continue engineering', () => {
  assert.equal(parseCheckpoint(fixture('active')).recovery, 'resume-after-verification');
  assert.equal(parseCheckpoint(fixture('implementation incomplete')).recovery, 'continue-implementation');
  assert.equal(
    parseCheckpoint(fixture('automated acceptance incomplete')).recovery,
    'continue-automated-acceptance',
  );
});
test('human and technical gates remain open without deadlocking independent engineering', () => {
  for (const [status, recovery] of [
    ['awaiting human verification', 'preserve-human-gate-and-continue-independent'],
    ['technically blocked', 'review-dependency-and-continue-independent'],
    ['blocked', 'review-dependency-and-continue-independent'],
  ]) {
    const state = parseCheckpoint(fixture(status));
    assert.equal(state.status, status);
    assert.equal(state.recovery, recovery);
    assert.equal(state.independentWork, 'continue-when-safe');
    assert.equal(state.nextAction, 'Inspect the existing native receipt before retrying.');
  }
  assert.equal(parseCheckpoint(fixture('accepted')).recovery, 'ready-for-next');
  for (const receiptOnlyStatus of ['received', 'queued', 'archived', 'committed', 'completed'])
    assert.throws(() => parseCheckpoint(fixture(receiptOnlyStatus)), /supported Status/);
});
test('updating or accepting the active task never consumes a deferred request', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-continuity-pending-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    const pending =
      'Request: later-demo\nStatus: deferred\nComplete instructions: preserve the existing demo and test its real user workflow.\n';
    fs.writeFileSync(path.join(root, 'docs/PENDING_REQUESTS.md'), pending);
    writeCheckpoint(root, fixture('active'));
    writeCheckpoint(root, fixture('accepted'));
    assert.equal(fs.readFileSync(path.join(root, 'docs/PENDING_REQUESTS.md'), 'utf8'), pending);
  } finally {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'spark-continuity-pending-'),
    );
    fs.rmSync(root, { recursive: true });
  }
});
test('atomic update retains one valid checkpoint; invalid or oversized writes preserve it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-continuity-'));
  try {
    writeCheckpoint(root, fixture('active'));
    writeCheckpoint(root, fixture('blocked'));
    assert.equal(fs.readFileSync(path.join(root, 'docs/ACTIVE_TASK.previous.md'), 'utf8'), fixture('active'));
    assert.throws(() => writeCheckpoint(root, 'incomplete'));
    assert.throws(() => writeCheckpoint(root, fixture('accepted') + 'x'.repeat(32768)));
    assert.equal(fs.readFileSync(path.join(root, 'docs/ACTIVE_TASK.md'), 'utf8'), fixture('blocked'));
    assert.deepEqual(fs.readdirSync(path.join(root, 'docs')).sort(), [
      'ACTIVE_TASK.md',
      'ACTIVE_TASK.previous.md',
    ]);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'spark-continuity-'));
    fs.rmSync(root, { recursive: true });
  }
});
test('repository recovery rules preserve safety without requiring obsolete cache roots or human deadlock', () => {
  const current = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.match(current, /canonical development directory is `D:\\Project Guilty Spark`/);
  assert.match(current, /Work on local `master`/);
  assert.match(current, /Never push or publish without authorization/);
  assert.match(current, /No security bypasses, unauthorized proprietary downloads or arbitrary remote tool execution/);
  assert.match(current, /changed, unique, ambiguous, active and accepted-release files remain protected/);
  assert.match(current, /Do not recreate `\.local`/);
  assert.doesNotMatch(current, /`\.local\/(?:tools|build|artifacts)[^`]*`/);
  assert.match(current, /Do not block unrelated, safely executable engineering/);
  assert.doesNotMatch(current, /obtaining explicit user authorization to defer before starting another directive/);
  const pending = fs.readFileSync(new URL('../docs/PENDING_REQUESTS.md', import.meta.url), 'utf8');
  assert.ok(pending.startsWith('# Pending engineering requests'));
  assert.ok(Buffer.byteLength(pending) <= 32768);
});
