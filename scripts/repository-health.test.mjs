import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseWorktrees, classifyStorage, scanStorage } from './repository-health.mjs';

test('worktree inventory retains detached recovery copies and exact branch names', () => {
  const rows = parseWorktrees(
    'worktree D:/Project Guilty Spark\nHEAD abc\nbranch refs/heads/master\n\nworktree D:/Project Guilty Spark/.local/old\nHEAD def\ndetached\n',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].branch, 'refs/heads/master');
  assert.equal(rows[1].branch, null);
  assert.equal(rows[1].detached, true);
});
test('classification protects originals, releases, native diagnostics and unknown jobs', () => {
  for (const p of [
    '.git/objects',
    'Halo Custom Edition/maps',
    'opencehalo-windows-release/maps',
    '.local/archives/C62',
    'target/release',
    '.local/x/validation-target/debug/examples',
  ])
    assert.equal(classifyStorage(p).classification, 'Preserve', p);
  assert.equal(classifyStorage('.local/native-run/tags').classification, 'Requires Review');
  assert.equal(classifyStorage('node_modules').classification, 'Reusable Cache');
  assert.equal(classifyStorage('.local/build/cargo/target/debug/deps').classification, 'Regenerable');
});
test('real filesystem scan is read-only, counts hardlinks once and does not follow directory links', () => {
  const parent = path.resolve('.local');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'health-contract-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'source.bin'), 'irreplaceable');
    fs.linkSync(path.join(root, 'data', 'source.bin'), path.join(root, 'duplicate.bin'));
    fs.symlinkSync(
      path.join(root, 'data'),
      path.join(root, 'alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const before = fs.readFileSync(path.join(root, 'data', 'source.bin'));
    const result = scanStorage(root);
    assert.equal(result.logicalBytes, before.length * 2);
    assert.equal(result.uniqueFileBytes, before.length);
    assert.equal(result.files, 2);
    assert.equal(result.links.length, 1);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(fs.readFileSync(path.join(root, 'data', 'source.bin')), before);
    assert.equal(result.directories.find((x) => x.relative === '').files, 2);
  } finally {
    const actual = fs.realpathSync(root);
    assert.equal(actual, root);
    assert.ok(actual.startsWith(parent + path.sep));
    // Only this test's explicitly verified temporary tree is removed.
    fs.rmSync(root, { recursive: true });
  }
});
test('the report CLI refuses removal flags rather than silently accepting them', () => {
  const result = spawnSync(process.execPath, ['scripts/repository-health.mjs', '--prune'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option/);
});
