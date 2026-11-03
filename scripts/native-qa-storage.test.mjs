import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { beginQaStorage } from './native-qa-storage.mjs';
test('Native QA storage records revision, outcome and real output without deleting evidence', async () => {
  await fs.mkdir('.local', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.local/storage-contract-'));
  try {
    const finish = await beginQaStorage(root, { workflow: 'contract', appSha256: 'a'.repeat(64) });
    let record = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
    assert.equal(record.status, 'incomplete');
    assert.equal(record.active, true);
    assert.match(record.sourceCommit, /^[a-f0-9]{40}$/);
    await fs.writeFile(path.join(root, 'unique.map'), 'unique fixture test bytes');
    await assert.rejects(beginQaStorage(root, { workflow: 'second', appSha256: 'b'.repeat(64) }), /EEXIST/);
    await assert.rejects(finish('unknown'), /Explicit/);
    await finish('failed');
    record = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
    assert.equal(record.status, 'failed');
    assert.equal(record.active, false);
    assert.equal(record.automaticDeletion, false);
    assert.ok(record.logicalBytes >= 25);
    assert.equal(await fs.readFile(path.join(root, 'unique.map'), 'utf8'), 'unique fixture test bytes');
  } finally {
    assert.equal(await fs.realpath(root), root);
    assert.ok(root.startsWith(path.resolve('.local') + path.sep));
    await fs.rm(root, { recursive: true });
  }
});
