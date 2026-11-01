// Read-only analysis of the pinned OpenCE actor observer. It cannot grant a
// game-protocol capability or establish human, cross-computer or full AI parity.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { analyzeRun } from './analyze-community-runtime-native.mjs';
export const OPEN_CE_AI = Object.freeze({
  exe: '788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0',
  pdb: 'b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800',
});
const NONE = 0xffffffff;
const digest = (b) => createHash('sha256').update(b).digest('hex');
const uint = (v, max = NONE) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const finite = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6;
const vector = (v) => Array.isArray(v) && v.length === 3 && v.every(finite);
const bit = (v) => v === 0 || v === 1;
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function boundedFile(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw Error('Expected bounded regular observation file');
  const bytes = fs.readFileSync(file),
    after = fs.lstatSync(file);
  if (bytes.length !== stat.size || stat.mtimeMs !== after.mtimeMs)
    throw Error('Observation changed during analysis');
  return bytes;
}
export function parseActorObservation(text, record) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 32 * 1024 * 1024)
    throw Error('Actor observation exceeds limit');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length > 1002 || lines.some((l) => l.length > 1024 * 1024))
    throw Error('Too many or oversized actor records');
  const rows = lines.map((l) => JSON.parse(l));
  const header = rows.shift(),
    footer = rows.pop();
  if (
    header?.schemaVersion !== 1 ||
    header.runtime !== 'opence-build-335' ||
    header.role !== record.role ||
    header.pid !== record.pid ||
    header.readOnly !== true ||
    header.exeSha256 !== OPEN_CE_AI.exe ||
    header.pdbSha256 !== OPEN_CE_AI.pdb ||
    header.pdb?.symType !== 3 ||
    header.pdb?.pdbUnmatched !== 0 ||
    header.pdb?.pdbAge !== 1 ||
    (header.detailedCensus !== undefined && typeof header.detailedCensus !== 'boolean') ||
    footer?.completed !== true ||
    footer.inputsRechecked !== true
  )
    throw Error('Missing matching runtime/PDB/read-only identity or complete readback');
  const samples = [],
    errors = {};
  let previous = -1,
    elapsed = -1;
  for (const row of rows) {
    if (!uint(row.sample, 759) || row.sample <= previous || !finite(row.elapsedMs) || row.elapsedMs < elapsed)
      throw Error('Invalid actor observation ordering');
    previous = row.sample;
    elapsed = row.elapsedMs;
    if (row.error) {
      if (typeof row.error !== 'string' || row.error.length > 160) throw Error('Invalid observation error');
      errors[row.error] = (errors[row.error] ?? 0) + 1;
      continue;
    }
    const s = row.state;
    if (
      !s ||
      !uint(s.localTick) ||
      !uint(s.serverTick) ||
      !uint(s.actorPoolCount, 1024) ||
      !uint(s.networkActorCount, 1056) ||
      !Array.isArray(s.actors) ||
      s.actors.length > s.networkActorCount ||
      s.actors.length > 1056
    )
      throw Error('Invalid actor snapshot bounds');
    if (row.readMs !== undefined && (!finite(row.readMs) || row.readMs < 0 || row.readMs > 60000))
      throw Error('Invalid native read duration');
    if (s.details !== undefined && s.details !== null) {
      const d = s.details;
      if (
        header.detailedCensus !== true ||
        !bit(d.aiProfileDisabled) ||
        !Array.isArray(d.actorPool) ||
        d.actorPool.length !== s.actorPoolCount ||
        d.actorPool.length > 1024 ||
        !Array.isArray(d.objects) ||
        d.objects.length > 4096
      )
        throw Error('Invalid detailed census bounds');
      const actorIds = new Set(),
        objectIds = new Set();
      for (const a of d.actorPool) {
        if (
          ![a.id, a.unitId, a.actorTag, a.variantTag].every((v) => uint(v)) ||
          actorIds.has(a.id) ||
          ![a.active, a.frozen, a.dormant, a.eraseNextTick, a.encounterless].every(bit) ||
          ![a.team, a.mode, a.action, a.combatStatus].every((v) => uint(v, 65535))
        )
          throw Error('Invalid detailed native actor');
        actorIds.add(a.id);
      }
      for (const o of d.objects) {
        if (
          ![o.id, o.tag, o.parentId, o.flags].every((v) => uint(v)) ||
          objectIds.has(o.id) ||
          !uint(o.type, 5) ||
          !vector(o.position) ||
          !vector(o.velocity) ||
          !finite(o.health) ||
          !finite(o.shield) ||
          !uint(o.damageFlags, 65535) ||
          !uint(o.team, 65535)
        )
          throw Error('Invalid detailed native object');
        objectIds.add(o.id);
        if (o.type <= 1) {
          const u = o.unit;
          if (
            !u ||
            ![u.actorId, u.playerId, u.flags].every((v) => uint(v)) ||
            !uint(u.seat, 65535) ||
            !uint(u.controlFlags, 65535) ||
            !vector(u.throttle)
          )
            throw Error('Invalid detailed native unit');
        } else if (o.type === 2) {
          const w = o.weapon;
          if (
            !w ||
            ![w.lastFiredTick, w.triggerFlags].every((v) => uint(v)) ||
            !uint(w.state, 255) ||
            !uint(w.triggerState, 255) ||
            !uint(w.triggerTimer, 65535)
          )
            throw Error('Invalid detailed native weapon');
        }
      }
    }
    const ids = new Set();
    for (const a of s.actors) {
      if (![a.id, a.tag, a.actorId, a.playerId, a.parentId].every((v) => uint(v)) || ids.has(a.id))
        throw Error('Invalid or duplicate actor identity');
      if (!vector(a.position))
        throw Error(
          `Invalid native actor position at sample ${row.sample} (unit ${a.id}, tag ${a.tag}; nonfinite or exceeds the 1000000-unit QA bound)`,
        );
      if (!vector(a.throttle))
        throw Error(`Invalid native actor throttle at sample ${row.sample} (unit ${a.id}, tag ${a.tag})`);
      if (
        !finite(a.health) ||
        !finite(a.shield) ||
        !(a.trigger === null || (finite(a.trigger) && a.trigger >= 0 && a.trigger <= 1)) ||
        !uint(a.team, 65535) ||
        !uint(a.seat, 65535) ||
        !uint(a.controlFlags, 65535) ||
        !uint(a.damageFlags, 65535) ||
        !uint(a.impulse, 65535) ||
        !uint(a.impulseSequence, 255) ||
        !uint(a.speechTag) ||
        !uint(a.speechSequence, 255) ||
        !(a.receivedTick === null || uint(a.receivedTick))
      )
        throw Error('Invalid or duplicate actor state');
      ids.add(a.id);
    }
    samples.push({ ...s, sample: row.sample, elapsedMs: row.elapsedMs, readMs: row.readMs });
  }
  return { header, samples, errors };
}
const distribution = (a) => {
  if (!a.length) return null;
  a = [...a].sort((a, b) => a - b);
  return {
    count: a.length,
    median: a[a.length >> 1],
    p95: a[Math.floor(a.length * 0.95)],
    maximum: a.at(-1),
  };
};
export function compareActorObservations(host, client) {
  const byTick = new Map(host.samples.map((s) => [s.serverTick, s]));
  const distances = [],
    health = [],
    shields = [],
    throttle = [],
    lags = [],
    ids = new Set(),
    moving = new Set(),
    firing = new Set();
  const outliers = [];
  let frames = 0,
    parentChanges = 0;
  for (const c of client.samples) {
    const h = byTick.get(c.serverTick);
    if (!h) continue;
    frames++;
    const ai = new Map(
      h.actors.filter((a) => a.actorId !== NONE && a.playerId === NONE).map((a) => [a.id, a]),
    );
    for (const ca of c.actors) {
      const ha = ai.get(ca.id);
      if (!ha || ca.tag !== ha.tag) continue;
      ids.add(ca.id);
      const d = distance(ha.position, ca.position);
      distances.push(d);
      health.push(Math.abs(ha.health - ca.health));
      shields.push(Math.abs(ha.shield - ca.shield));
      throttle.push(distance(ha.throttle, ca.throttle));
      if (ca.receivedTick !== null) lags.push(c.localTick - ca.receivedTick);
      if (ha.parentId !== ca.parentId || ha.seat !== ca.seat) parentChanges++;
      if (ca.throttle.some((v) => Math.abs(v) > 0.05)) moving.add(ca.id);
      if (ca.trigger !== null && ca.trigger > 0.1) firing.add(ca.id);
      // This is a review marker, never an omitted sample or approved tolerance.
      if (d > 1)
        outliers.push({
          tick: c.serverTick,
          id: ca.id,
          tag: ca.tag,
          distance: d,
          hostParent: ha.parentId,
          clientParent: ca.parentId,
          hostSeat: ha.seat,
          clientSeat: ca.seat,
        });
    }
  }
  return {
    exactTickFrames: frames,
    sharedActualActorIds: ids.size,
    movingActorIds: moving.size,
    firingActorIds: firing.size,
    position: distribution(distances),
    health: distribution(health),
    shield: distribution(shields),
    throttle: distribution(throttle),
    receivedControlAgeTicks: distribution(lags),
    parentOrSeatDifferences: parentChanges,
    largePositionDifferences: { total: outliers.length, examples: outliers.slice(0, 32) },
    hostAuthorityObserved:
      ids.size > 0 &&
      host.samples.some((s) => s.actorPoolCount > 0) &&
      client.samples.every((s) => s.actorPoolCount === 0 && s.actors.every((a) => a.actorId === NONE)),
    aiActorAcceptance: false,
    fullLifecycleAcceptance: false,
    twoComputerAcceptance: false,
    note: 'All pairs remain in the distributions. Same-tick process reads are not atomic engine packets; counters advance separately from position, damage, seat and control updates. No parity or latency threshold is approved here.',
  };
}
export function analyzeActors(directory) {
  const root = path.resolve(directory),
    receiptBytes = boundedFile(path.join(root, 'execution.json'), 1024 * 1024),
    receipt = JSON.parse(receiptBytes);
  if (
    receipt.private !== true ||
    receipt.publicListing !== false ||
    receipt.routerFirewallChanges !== false ||
    receipt.originalInputMapsUnchanged !== true ||
    !Array.isArray(receipt.executed) ||
    receipt.executed.length !== 2 ||
    receipt.errors?.length
  )
    throw Error('Private native execution and preserved source receipt required');
  const observations = [];
  const identities = [];
  for (const role of ['host', 'client']) {
    const matches = receipt.executed.filter((r) => r.role === role);
    if (matches.length !== 1) throw Error('One process per role required');
    const r = matches[0],
      ai = r.aiObserver;
    if (
      r.runtime !== 'opence-build-335' ||
      r.exeSha256 !== OPEN_CE_AI.exe ||
      r.exitCode !== 0 ||
      r.forced ||
      !r.inputsUnchanged ||
      !ai ||
      ai.exitCode !== 0 ||
      ai.forced ||
      ai.readOnly !== true ||
      ai.pdbSha256 !== OPEN_CE_AI.pdb ||
      !/^[a-f0-9]{64}$/.test(ai.sha256)
    )
      throw Error('Incomplete or unsupported native actor observer');
    const bytes = boundedFile(path.join(root, role, 'ai-observer.ndjson'), 32 * 1024 * 1024);
    if (digest(bytes) !== ai.logSha256) throw Error('Actor observation checksum mismatch');
    const text = new TextDecoder('utf8', { fatal: true }).decode(bytes);
    const observed = parseActorObservation(text, r);
    observations.push(observed);
    identities.push({
      role,
      pid: r.pid,
      observerSha256: ai.sha256,
      logSha256: digest(bytes),
      samples: observed.samples.length,
      readErrors: observed.errors,
      maximumActorPool: Math.max(0, ...observed.samples.map((s) => s.actorPoolCount)),
      maximumNetworkActors: Math.max(0, ...observed.samples.map((s) => s.networkActorCount)),
      readTimingMs: distribution(observed.samples.flatMap((s) => (s.readMs === undefined ? [] : [s.readMs]))),
      detailedCensus: (() => {
        const rows = observed.samples.filter((s) => s.details);
        const counts = (s) => ({
          tick: s.serverTick,
          actors: s.details.actorPool.length,
          activeActors: s.details.actorPool.filter((a) => a.active).length,
          bipeds: s.details.objects.filter((o) => o.type === 0).length,
          vehicles: s.details.objects.filter((o) => o.type === 1).length,
        });
        return {
          frames: rows.length,
          readTimingMs: distribution(rows.map((s) => s.readMs).filter((v) => v !== undefined)),
          last: rows.length ? counts(rows.at(-1)) : null,
          peakActiveActors: Math.max(
            0,
            ...rows.map((s) => s.details.actorPool.filter((a) => a.active).length),
          ),
        };
      })(),
    });
  }
  if (
    identities[0].pid === identities[1].pid ||
    identities[0].observerSha256 !== identities[1].observerSha256
  )
    throw Error('Two independent matching observers required');
  const native = analyzeRun(root),
    comparison = compareActorObservations(...observations);
  return {
    schemaVersion: 1,
    analyzer: 'analyze-opence-ai',
    analyzerSourceSha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    nativeAnalyzerProvenance: native.provenance,
    executionSha256: digest(receiptBytes),
    runtime: 'opence-build-335',
    mode: receipt.mode,
    nativeJoin: native.verdict,
    identities,
    comparison,
    actorControlsObserved:
      comparison.hostAuthorityObserved &&
      comparison.movingActorIds > 0 &&
      native.verdict.joinMarkersObserved &&
      native.verdict.bidirectionalPacketCountersObserved,
    nativeHealth: native.nativeHealth,
    nativeFaultsObserved: native.nativeHealth.some((h) => h.status === 'native-faults-observed'),
    aiActorAcceptance: false,
    limitations: [
      'One physical computer, scripted player input, null rendering and dummy audio.',
      'Only upstream build-335 actor telemetry is observed. This is not a new MCC/CE protocol bridge, authoring path, or complete Zombie Apocalypse conversion.',
      'Damage/death, late join, reconnect, script/encounter coverage, audiovisual playback and cross-computer acceptance remain distinct gates.',
    ],
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--run')
      throw Error('Usage: node scripts/analyze-opence-ai.mjs --run <private-native-pair>');
    const r = analyzeActors(process.argv[3]);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    if (
      !r.actorControlsObserved ||
      r.nativeFaultsObserved ||
      r.nativeJoin.status === 'invalid-or-failed-evidence'
    )
      process.exitCode = 2;
  } catch (e) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: 1,
          analyzer: 'analyze-opence-ai',
          analysisAccepted: false,
          aiActorAcceptance: false,
          error: String(e).slice(0, 500),
        },
        null,
        2,
      ) + '\n',
    );
    process.stderr.write(String(e) + '\n');
    process.exitCode = 1;
  }
}
