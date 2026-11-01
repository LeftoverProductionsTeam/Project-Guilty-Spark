import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDraft, client } from './draft.mjs';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const commit = 'a'.repeat(40),
  tag = 'v0.4.1-preview.1';
function fixture({ existingRelease, existingTag, corruptDownload, wrongRun, linuxCommit } = {}) {
  const calls = [],
    assets = [],
    bytes = Buffer.from('Synthetic release protocol fixture');
  const m = {
    sourceCommit: commit,
    releaseTag: tag,
    applicationVersion: '0.4.1',
    workflow: { runId: wrongRun ? '2' : '1' },
  };
  const set = {
    identity: m,
    manifests: [m],
    assets: [{ name: 'Spark_Setup.exe', bytes, sha256: sha(bytes) }],
  };
  if (linuxCommit) set.manifests.push({ ...m, sourceCommit: linuxCommit });
  const api = async (route, options = {}) => {
    calls.push({ route, ...options });
    if (route.includes('/commits/')) return { sha: commit };
    if (route.includes('/releases/tags/')) return existingRelease ?? null;
    if (route.includes('/git/ref/tags/')) return existingTag ?? null;
    if (route.endsWith('/releases') && options.method === 'POST')
      return {
        id: 1,
        tag_name: tag,
        draft: true,
        prerelease: true,
        upload_url: 'https://uploads.github.com/repos/test/releases/1/assets{?name,label}',
      };
    if (route.startsWith('https://uploads.github.com')) {
      const a = {
        id: 17,
        name: 'Spark_Setup.exe',
        size: bytes.length,
        state: 'uploaded',
        digest: 'sha256:' + sha(bytes),
      };
      assets.push(a);
      return a;
    }
    if (route.includes('/releases/assets/17')) return corruptDownload ? Buffer.from('corrupt') : bytes;
    if (route.endsWith('/assets?per_page=100')) return assets;
    if (route.endsWith('/releases/1'))
      return {
        id: 1,
        tag_name: tag,
        draft: true,
        prerelease: true,
        target_commitish: commit,
        html_url: 'https://github.com/test/draft',
      };
    throw Error('Unexpected protocol request: ' + route);
  };
  return { calls, set, api };
}
test('new release stays draft and every attached asset is downloaded and hashed', async () => {
  const f = fixture(),
    r = await createDraft(f.set, f.api, { runId: '1' });
  assert.equal(r.draft, true);
  assert.equal(r.publicPublicationVerified, false);
  assert.equal(r.attachedAssetsVerified[0].downloadVerified, true);
  const mutations = f.calls.filter((c) => c.method);
  assert.equal(mutations.length, 2);
  assert.equal(mutations[0].json.draft, true);
  assert.equal(mutations[0].json.prerelease, true);
  assert(!f.calls.some((c) => ['PATCH', 'DELETE', 'PUT'].includes(c.method)));
});
test('existing public or draft releases and existing tags are never overwritten', async () => {
  for (const options of [
    { existingRelease: { draft: false } },
    { existingRelease: { draft: true } },
    { existingTag: {} },
  ]) {
    const f = fixture(options);
    await assert.rejects(createDraft(f.set, f.api), /already/);
    assert(!f.calls.some((c) => c.method));
  }
});
test('corrupt downloaded upload cannot be reported verified', async () => {
  const f = fixture({ corruptDownload: true });
  await assert.rejects(createDraft(f.set, f.api), /failed verification/);
});
test('another workflow run cannot attach packages to this draft', async () => {
  const f = fixture({ wrongRun: true });
  await assert.rejects(createDraft(f.set, f.api, { runId: '1' }), /another workflow/);
  assert(!f.calls.some((c) => c.method));
});
test('mixed Linux/Windows source revisions cannot become one release', async () => {
  const f = fixture({ linuxCommit: 'b'.repeat(40) });
  await assert.rejects(createDraft(f.set, f.api), /source identities differ/);
  assert.equal(f.calls.length, 0);
});
test('release token is required and cannot be sent to an arbitrary API host', async () => {
  assert.throws(() => client(''), /Authenticated/);
  let calls = 0;
  const api = client('synthetic-test-value', async () => {
    calls++;
  });
  await assert.rejects(api('https://example.invalid/'), /Unexpected GitHub/);
  assert.equal(calls, 0);
});
