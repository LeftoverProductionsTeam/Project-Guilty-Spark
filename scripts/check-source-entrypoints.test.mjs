import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectEntrypoints, checkSourceEntrypoints } from './check-source-entrypoints.mjs';

test('module contracts reject generated caches and retired archives in all import forms', () => {
  for (const file of [
    '/node_modules/.vite/deps/three.js',
    '../.vite/deps/three-ABC.js?v=123',
    '../.local/tool/source.ts',
    '../preserved/recovery-archives/source.mjs',
    '/@fs/C:/Temp/GuiltySpark-Development-abc/cache/module.js',
  ]) {
    const literal = JSON.stringify(file);
    for (const code of [
      `import x from ${literal}`,
      `export * from ${literal}`,
      `await import(${literal})`,
      `require(${literal})`,
      `new URL(${literal}, import.meta.url)`,
    ])
      assert.equal(inspectEntrypoints('test.ts', code).length, 1, code);
  }
});
test('package and source imports work without treating negative fixtures or history as imports', () => {
  assert.deepEqual(
    inspectEntrypoints(
      'test.ts',
      `
    import * as THREE from 'three';
    export { createVisualPipeline } from '../../../src/visualPipeline';
    await import('/tests/ui/fixtures/render-alpha.ts');
    // Historical import('/node_modules/.vite/deps/three.js')
    const negative = "import('../.local/obsolete.mjs')";
  `,
    ),
    [],
  );
});
test('the actual application, tests, packaging and executable documentation use source interfaces', async () => {
  const result = await checkSourceEntrypoints();
  assert.ok(result.checkedFiles > 100);
  assert.equal(result.issues, 0);
});
