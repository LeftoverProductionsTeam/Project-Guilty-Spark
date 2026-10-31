// Compare complete native-app runs only after checking content/quality parity.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const args = process.argv.slice(2);
if (args.length < 5 || args.length > 13 || args.length % 2 !== 1)
  throw Error(
    'compare-workbench-profiles <2 to 6 before.json files> <same count after.json files> <fresh-report.json>',
  );
const inputs = args.slice(0, -1), pairCount = inputs.length / 2;
const runs = await Promise.all(
  inputs.map(async (file) => JSON.parse(await fs.readFile(file, 'utf8'))),
);
assert.equal(new Set(inputs.map((file) => path.resolve(file))).size, inputs.length,
  'Every run must have its own independent fresh-profile result');
const before = runs.slice(0, pairCount),
  after = runs.slice(pairCount),
  median = (values) => {
    const sorted = [...values].sort((a, b) => a - b),
      middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
assert.equal(new Set(before.map((run) => run.appSha256)).size, 1, 'Baseline executables differ');
assert.equal(new Set(after.map((run) => run.appSha256)).size, 1, 'Final executables differ');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const phase = (run, name) => {
  const found = run.phases.find((row) => row.name === name);
  assert(found, `Missing phase ${name}`);
  return found;
};
const measure = (select, higherIsBetter = false) => {
  const b = before.flatMap(select),
    a = after.flatMap(select),
    bMedian = median(b),
    aMedian = median(a);
  return {
    before: b,
    after: a,
    beforeMedian: bMedian,
    afterMedian: aMedian,
    betterWhen: higherIsBetter ? 'higher' : 'lower',
    improvementPercent: ((100 * (bMedian - aMedian)) / bMedian) * (higherIsBetter ? -1 : 1),
  };
};
const quality = [];
for (const run of runs) {
  assert.equal(run.complete, true);
  assert.equal(run.mockedIpc, false);
  assert.deepEqual(run.errors, []);
  const { viewport, contentViewport, mapViewport, ...otherConditions } = run.conditions;
  const {
    viewport: beforeViewport,
    contentViewport: beforeContent,
    mapViewport: beforeMap,
    ...beforeConditions
  } = before[0].conditions;
  assert.deepEqual(otherConditions, beforeConditions);
  assert.deepEqual(
    contentViewport ?? { width: viewport.width - 12, height: viewport.height - 12 },
    beforeContent ?? { width: beforeViewport.width - 12, height: beforeViewport.height - 12 },
  );
  for (const key of [
    'modelTag',
    'modelSourceHash',
    'modelTriangles',
    'nativeAnimationCount',
    'modelTextures',
    'modelReflections',
  ])
    assert.equal(run.showcase.model[key], before[0].showcase.model[key]);
  for (const key of ['environment', 'effects'])
    assert.equal(run.showcase.canvas[key], before[0].showcase.canvas[key]);
  assert(run.showcase.canvas.height >= before[0].showcase.canvas.height);
  assert(run.showcase.canvas.width >= before[0].showcase.canvas.width);
  for (const map of [1, 2]) {
    const native = phase(run, `native-import-${map}`).result,
      original = phase(before[0], `native-import-${map}`).result;
    for (const key of ['sha256', 'version', 'tags', 'objects', 'renderTriangles', 'modelTypes', 'decals'])
      assert.equal(native[key], original[key]);
    const reference = phase(before[0], `first-textured-map-${map}`).result;
    for (const row of run.phases.filter(
      (row) =>
        row.name === `first-textured-map-${map}` ||
        (row.name.startsWith('map-switch-') && row.name.endsWith(`-to-${map}`)),
    )) {
      const current = row.result;
      assert.equal(current.world.materialLoading, 'false');
      assert.equal(current.world.pendingMaterials, '0');
      for (const key of [
        'sourceShaders',
        'compatibleShaders',
        'sourceShaderIds',
        'sourceLightmaps',
        'skyTriangles',
      ])
        assert.equal(current.world[key], reference.world[key]);
      for (const key of ['sourceDetails', 'sourceReflections'])
        assert(Number(current.world[key]) >= Number(reference.world[key]), `Lost ${key}: ${row.name}`);
      assert.deepEqual(current.decals, reference.decals);
      assert.deepEqual(current.canvas, reference.canvas);
      assert.equal(current.render.geometries, reference.render.geometries);
      assert.equal(current.render.triangles, reference.render.triangles);
      quality.push({
        appSha256: run.appSha256,
        phase: row.name,
        sourceSha256: native.sha256,
        sourceShaders: Number(current.world.sourceShaders),
        compatibleShaders: Number(current.world.compatibleShaders),
        shaderIdsSha256: digest(current.world.sourceShaderIds),
        lightmaps: Number(current.world.sourceLightmaps),
        materialExtras: Number(current.world.sourceDetails),
        reflectionBindings: Number(current.world.sourceReflections),
        reflectionIssues: current.world.reflectionIssues.split(' | ').filter(Boolean).length,
        decals: current.decals,
        nativeSourceRenderTriangles: native.renderTriangles,
        nativeModelTypes: native.modelTypes,
        residentGeometries: current.render.geometries,
        visiblePassTriangles: current.render.triangles,
        canvas: [current.canvas.width, current.canvas.height],
      });
    }
  }
  assert.equal(phase(run, 'large-asset-catalog').result.visibleCards, 150);
  assert.match(phase(run, 'large-asset-catalog').result.text, /150 of 1082 shown/);
}
const phaseTimes = {};
for (const name of before[0].phases.filter((row) => row.result).map((row) => row.name))
  phaseTimes[name] = measure((run) => [phase(run, name).elapsedMs]);
const counters = {};
for (const name of before[0].phases.filter((row) => row.before).map((row) => row.name)) {
  const gpu = (row) =>
    row.after.gpuEngines
      .filter((e) => e.name.includes('engtype_3D'))
      .reduce((sum, e) => sum + e.utilizationPercent, 0);
  const memory = (row) => row.after.gpuMemory.reduce((sum, m) => sum + m.dedicatedBytes, 0) / 1048576;
  counters[name] = {
    cpuMachinePercent: measure((run) => [phase(run, name).cpuMachinePercent]),
    residentMiB: measure((run) => [phase(run, name).after.workingSetBytes / 1048576]),
    privateMiB: measure((run) => [phase(run, name).after.privateBytes / 1048576]),
    gpu3DPercent: measure((run) => [gpu(phase(run, name))]),
    gpuDedicatedMiB: measure((run) => [memory(phase(run, name))]),
  };
}
const repeats = (run) => run.phases.filter((row) => row.name.startsWith('map-switch-'));
const totals = (rows, name) => rows.flatMap((row) => row.nativeAndDecode).filter((e) => e.name === name);
const report = {
  schemaVersion: 1,
  complete: true,
  qualityAccepted: true,
  conditions: {
    ...before[0].conditions,
    contentViewport: { width: 1428, height: 888 },
    afterMapViewport: after[0].conditions.mapViewport,
  },
  beforeApplicationSha256: [...new Set(before.map((r) => r.appSha256))],
  afterApplicationSha256: [...new Set(after.map((r) => r.appSha256))],
  sourceRuns: inputs.map((f) => path.basename(path.dirname(f))),
  processColdShellMs: measure((run) => [run.coldStartup.shellMs]),
  warmProcessShellMs: measure((run) => [run.warmStartup.shellMs]),
  processColdShowcaseMs: measure((run) => [run.coldStartup.processToShowcaseReadyMs]),
  warmProcessShowcaseMs: measure((run) => [run.warmStartup.processToShowcaseReadyMs]),
  pollingIpcMs: measure((run) => run.coldStartup.pollingRoundTripMs),
  openProjectIpcMs: measure((run) => run.openProjectRoundTrips.map((r) => r.elapsedMs)),
  phaseTimes,
  repeatSwitchMs: measure((run) => repeats(run).map((r) => r.elapsedMs)),
  repeatBitmapDecodeMs: measure((run) => [
    totals(repeats(run), 'spark.decode.bitmap-batch').reduce((sum, e) => sum + e.ms, 0),
  ]),
  repeatCubeRequests: measure((run) => [
    totals(repeats(run), 'spark.ipc.preview_owned_reflection_cube').length +
      totals(repeats(run), 'spark.ipc.preview_owned_reflection_cube_batch').length,
  ]),
  repeatCubeBatchRequests: measure((run) => [
    totals(repeats(run), 'spark.ipc.preview_owned_reflection_cube_batch').length,
  ]),
  renderingFps: measure((run) => repeats(run).map((r) => r.result.render.fps), true),
  counters,
  quality,
  notes: [
    `${pairCount} complete independent fresh-profile runs for each executable; home/startup use 1440x900/DPR 1. The same 1428x888 map work area and exact canvas dimensions are required for both executables.`,
    'Settled readiness includes every authored decal, zero pending materials and a stable signature for at least 750 ms.',
    'Process-cold does not mean a flushed Windows disk cache. Warm process reuses its own library/WebView profile.',
    'CPU/RAM/GPU are settled owned process-tree observations, not peak allocations or isolated whole-machine GPU benchmarks.',
    'Map canvas resolution, environment/effects, native source mesh/model/object counts, resident geometries and visible-pass triangles must all match. Compact layout/scrollbars can increase the home width; home may not use fewer pixels.',
    'Native read/hash/resource validation still executes on repeated preview requests; the bounded pixel cache reuses only identical freshly validated DDS bytes.',
    'Reflection request counts include both single-cube and bounded four-cube native transactions. Batch count is reported separately; content parity checks still require the same final shader bindings.',
  ],
};
await fs.writeFile(args.at(-1), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    complete: true,
    qualityAccepted: true,
    repeatSwitchMs: report.repeatSwitchMs,
    repeatBitmapDecodeMs: report.repeatBitmapDecodeMs,
    repeatCubeRequests: report.repeatCubeRequests,
  }),
);
