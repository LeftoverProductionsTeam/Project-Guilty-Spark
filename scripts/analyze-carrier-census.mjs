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
const bounds = points => points.length ? [0, 1, 2].map(i => [
  Math.min(...points.map(p => p[i])), Math.max(...points.map(p => p[i])),
]) : null;
const report = {
  schemaVersion: 1,
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
      !/^[a-f0-9]{64}$/.test(identity.exeSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(identity.pdbSha256 ?? '') ||
      rows.at(-1)?.completed !== true || rows.at(-1)?.inputsRechecked !== true)
    throw Error('Incomplete observer run or missing read-only native identity');
  const states = rows.filter(row => row.state), actors = new Map(), vehicles = [];
  if (!states.length) throw Error('No native state samples');
  for (const row of states) {
    const state = row.state;
    if (!Number.isSafeInteger(state.serverTick) || !Array.isArray(state.actors) ||
        state.actors.length > 512 || !Number.isSafeInteger(state.actorPoolCount))
      throw Error('Invalid native state envelope');
    for (const actor of state.actors) {
      if (!Number.isSafeInteger(actor.id) || !Number.isSafeInteger(actor.parentId) ||
          !Number.isSafeInteger(actor.seat) || !Number.isFinite(actor.health) || !vector(actor.position))
        throw Error('Malformed actor sample');
      let observed = actors.get(actor.id);
      if (!observed) {
        observed = { id: actor.id, firstTick: state.serverTick, lastTick: state.serverTick,
          parents: new Set(), seats: new Set(), minimumHealth: actor.health,
          maximumHealth: actor.health, unparentedPositions: [] };
        actors.set(actor.id, observed);
      }
      observed.lastTick = state.serverTick;
      observed.parents.add(actor.parentId); observed.seats.add(actor.seat);
      observed.minimumHealth = Math.min(observed.minimumHealth, actor.health);
      observed.maximumHealth = Math.max(observed.maximumHealth, actor.health);
      // Attached object positions are local to their parent, not world coordinates.
      if (actor.parentId === none) observed.unparentedPositions.push(actor.position);
    }
    for (const object of state.details?.objects ?? []) {
      if (object.type !== 1) continue;
      if (!vector(object.position) || !vector(object.velocity)) throw Error('Malformed vehicle sample');
      vehicles.push(object);
    }
  }
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
      unparentedSamples: actor.unparentedPositions.length,
      unparentedPositionBounds: bounds(actor.unparentedPositions),
    })),
    vehicleSamples: vehicles.length,
    maximumObservedVehicleSpeedNativeUnits: Math.max(0, ...vehicles.map(object => Math.hypot(...object.velocity))),
    vehiclePositionBounds: bounds(vehicles.map(object => object.position)),
    finalActorCount: states.at(-1).state.actorPoolCount,
    finalVehicleCount: (states.at(-1).state.objectTags ?? []).filter(object => object.type === 1)
      .reduce((sum, object) => sum + object.count, 0),
  });
}
await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ trials: report.trials.length, analysisOnly: true, lifecycleAccepted: false }));
