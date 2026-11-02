// Read-only analysis of the existing exact-symbol native observer output.
// This does not certify collision, animation, combat, playback or replication.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [destination, ...inputs] = process.argv.slice(2);
if (!destination || !inputs.length || inputs.length > 8)
  throw Error('analyze-carrier-census <fresh-report.json> <observer.ndjson> [up to eight trials]');
const none = 0xffffffff;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const bounds = points => {
  if (!points.length) return null;
  const result = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (const point of points) for (let i = 0; i < 3; i++) {
    result[i][0] = Math.min(result[i][0], point[i]); result[i][1] = Math.max(result[i][1], point[i]);
  }
  return result;
};
const exePin = '788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0';
const pdbPin = 'b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800';
// OpenCE build-335, da8d455623cf50002e6a798b1980068fd3ca0292:
// source/objects/objects.h defines _object_dead_bit as bit 2.
const deadMask = 1 << 2;
const datum = value => Number.isSafeInteger(value) && value >= 0 && value <= none;
const report = {
  schemaVersion: 2,
  analysisOnly: true,
  atomicSnapshots: false,
  lifecycleAccepted: false,
  gamePeerReplicationTested: false,
  note: 'Native sampled observations are evidence, not a collision/animation or complete lifecycle acceptance.',
  trials: [],
};
for (const input of inputs) {
  const metadata = await fs.lstat(input);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024 * 1024)
    throw Error('Census must be a regular file within the 16 MiB analysis bound');
  const bytes = await fs.readFile(input);
  const lines = bytes.toString('utf8').trim().split(/\r?\n/);
  if (lines.length > 10000) throw Error('Census exceeds 10000 rows');
  const rows = lines.map(line => JSON.parse(line)), identity = rows[0];
  if (identity?.readOnly !== true || identity.atomicSnapshot !== false || identity.detailedCensus !== true ||
      rows.at(-1)?.completed !== true || rows.at(-1)?.inputsRechecked !== true)
    throw Error('Incomplete observer run or missing read-only native identity');
  if (identity.runtime !== 'opence-build-335' || identity.exeSha256 !== exePin || identity.pdbSha256 !== pdbPin)
    throw Error('Unsupported native unit flag schema; exact executable and symbols are required');
  const states = rows.filter(row => row.state), actors = new Map(), vehicles = [];
  if (!states.length) throw Error('No native state samples');
  // Discover full salted unit identities before following their object lives.
  // The live/network actor tables omit corpses; absence there is not cleanup.
  for (const row of states) for (const actor of row.state.actors ?? []) {
    if (!datum(actor.id) || actor.id === none) throw Error('Invalid unit identity');
    if (!actors.has(actor.id)) actors.set(actor.id, {
      id: actor.id, firstTick: row.state.serverTick, lastTick: row.state.serverTick,
      lastActorTick: row.state.serverTick, parents: new Set(), seats: new Set(),
      minimumHealth: Infinity, maximumHealth: -Infinity, activeSamples: 0,
      objectSamples: 0, livePositions: [], corpsePositions: [],
      deathTicks: [], health: [], damageFlags: new Set(), animationFrames: new Set(),
    });
  }
  const observe = (observed, sample, tick, completeObject) => {
    if (!datum(sample.parentId) || !Number.isSafeInteger(sample.seat) || sample.seat < 0 || sample.seat > 65535 ||
        !Number.isFinite(sample.health) || !vector(sample.position) || !Number.isSafeInteger(sample.damageFlags) || sample.damageFlags < 0 || sample.damageFlags > 65535)
      throw Error('Malformed unit sample');
    observed.firstTick = Math.min(observed.firstTick, tick); observed.lastTick = Math.max(observed.lastTick, tick);
    observed.parents.add(sample.parentId); observed.seats.add(sample.seat);
    observed.minimumHealth = Math.min(observed.minimumHealth, sample.health);
    observed.maximumHealth = Math.max(observed.maximumHealth, sample.health);
    observed.health.push(sample.health); observed.damageFlags.add(sample.damageFlags);
    const dead = (sample.damageFlags & deadMask) !== 0;
    if (dead) observed.deathTicks.push(tick);
    if (completeObject && sample.parentId === none && sample.seat === 65535) {
      // A death-driven detach must never count as a successful live ejection.
      if (sample.health > 0 && !dead) observed.livePositions.push(sample.position);
      else if (dead) observed.corpsePositions.push(sample.position);
    }
    if (completeObject) {
      observed.objectSamples++;
      if (Number.isSafeInteger(sample.animationIndex) && sample.animationIndex !== 65535 &&
          Number.isSafeInteger(sample.animationFrame) && sample.animationFrame !== 65535)
        observed.animationFrames.add(`${sample.animationIndex}:${sample.animationFrame}`);
    } else { observed.activeSamples++; observed.lastActorTick = tick; }
  };
  for (const row of states) {
    const state = row.state;
    if (!Number.isSafeInteger(state.serverTick) || state.serverTick < 0 || !Array.isArray(state.actors) ||
        state.actors.length > 512 || !Number.isSafeInteger(state.actorPoolCount) || state.actorPoolCount < 0 || state.actorPoolCount > 512)
      throw Error('Invalid native state envelope');
    for (const actor of state.actors) observe(actors.get(actor.id), actor, state.serverTick, false);
    const objects = state.details?.objects ?? [];
    if (!Array.isArray(objects) || objects.length > 4096) throw Error('Invalid complete-object census');
    for (const object of objects) {
      if (actors.has(object.id)) {
        if (object.type !== 0 || !object.unit) throw Error('AI unit identity changed type');
        observe(actors.get(object.id), { ...object, ...object.unit }, state.serverTick, true);
      }
      if (object.type === 1) {
        if (!vector(object.position) || !vector(object.velocity)) throw Error('Malformed vehicle sample');
        vehicles.push(object);
      }
    }
  }
  const detailed = states.filter(row => row.state.details);
  if (!detailed.length) throw Error('No complete-object snapshots; death and cleanup cannot be assessed');
  report.trials.push({
    input: path.basename(path.dirname(input)) + '/' + path.basename(input),
    inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    identity: { runtime: identity.runtime, role: identity.role, exeSha256: identity.exeSha256,
      pdbSha256: identity.pdbSha256 },
    samples: states.length, detailedSamples: states.filter(row => row.state.details).length,
    firstTick: states[0].state.serverTick, lastTick: states.at(-1).state.serverTick,
    sampleErrors: rows.filter(row => row.error).length,
    actorCounts: [...new Set(states.map(row => row.state.actorPoolCount))],
    actors: [...actors.values()].map(actor => ({
      id: actor.id, firstTick: actor.firstTick, lastTick: actor.lastTick,
      parents: [...actor.parents], seats: [...actor.seats],
      minimumHealth: actor.minimumHealth, maximumHealth: actor.maximumHealth,
      lastActorTick: actor.lastActorTick, activeActorSamples: actor.activeSamples,
      completeObjectSamples: actor.objectSamples,
      liveUnparentedSamples: actor.livePositions.length,
      liveUnparentedPositionBounds: bounds(actor.livePositions),
      corpseUnparentedSamples: actor.corpsePositions.length,
      nativeDeadFlagObserved: actor.deathTicks.length > 0,
      firstObservedDeathTick: actor.deathTicks.length ? actor.deathTicks.reduce((a, b) => Math.min(a, b)) : null,
      nonlethalHealthReductionObserved: actor.health.some(value => value > 0 && value < actor.maximumHealth - 0.00001),
      damageFlagValues: [...actor.damageFlags],
      animationFrameProgressObserved: actor.animationFrames.size > 1,
      absentFromFinalCompleteSnapshots: detailed.length >= 3 && detailed.slice(-3).every(row =>
        !(row.state.details.objects ?? []).some(object => object.id === actor.id)),
    })),
    vehicleSamples: vehicles.length,
    maximumObservedVehicleSpeedNativeUnits: vehicles.reduce((maximum, object) => Math.max(maximum, Math.hypot(...object.velocity)), 0),
    vehiclePositionBounds: bounds(vehicles.map(object => object.position)),
    finalActorCount: states.at(-1).state.actorPoolCount,
    finalVehicleCount: (states.at(-1).state.objectTags ?? []).filter(object => object.type === 1)
      .reduce((sum, object) => sum + object.count, 0),
  });
}
await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ trials: report.trials.length, analysisOnly: true, lifecycleAccepted: false }));
