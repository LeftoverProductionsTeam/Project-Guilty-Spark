#!/usr/bin/env node
// Read-only analysis of the upstream native network-test logs. No game launches.
// Usage: node scripts/analyze-community-runtime-native.mjs --run <pair-directory>
// Exit 0: selected sampled state agrees; 2: refused, incomplete, or disagrees;
// 1: input/usage error. None of these certify human play or complete game parity.
// Format references (an original parser; no upstream engine code is included):
// https://github.com/OpenCommunityEdition/OpenCE/blob/70c5e600ea345345db040ce1914903cc6746b46e/port/linux/game/network_test.c
// https://github.com/ChupathingyCE/chupathingyce/blob/880a933ec33b2ae2dbbeb4018a9090c528a075bc/port/linux/game/network_test.c
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const LIMITS = Object.freeze({
  logBytes: 8 * 1024 * 1024,
  receiptBytes: 1024 * 1024,
  lineLength: 16384,
  samples: 8192,
  players: 128,
  details: 64,
  phaseTicks: 2,
});
const STATE_FIELDS = [
  'alive',
  'health',
  'shield',
  'score',
  'kills',
  'deaths',
  'friendlyFireKills',
  'team',
  'machine',
];
const NATIVE_PREFIX = /^(?:halo-linux|chupathingyce): /;
const FLOAT = '-?\\d+(?:\\.\\d+)?';
const ALIVE = new RegExp(
  '^\\((' + FLOAT + ') (' + FLOAT + ') (' + FLOAT + ')\\) h(' + FLOAT + ')/(' + FLOAT + ')(?: |$)',
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const round = (value) => (Number.isFinite(value) ? Number(value.toFixed(8)) : null);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const boundedString = (value, max = 160) => (typeof value === 'string' ? value.slice(0, max) : null);
const detail = (values) => ({
  total: values.length,
  truncated: values.length > LIMITS.details,
  examples: values.slice(0, LIMITS.details),
});

function readBounded(root, relative, maxBytes) {
  const file = path.join(root, ...relative.split('/'));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
    throw new Error('Expected a bounded regular file: ' + relative);
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  if (bytes.length > maxBytes || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
    throw new Error('Input changed during analysis: ' + relative);
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''),
  };
}

function cleanMessage(line) {
  return line
    .replace(/halo:\/\/\S+/gi, '[invitation]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, '[local path]')
    .slice(0, 360);
}

function parsePlayer(id, text) {
  const alive = text.match(ALIVE);
  const counters = text.match(/\ss(-?\d+) k(-?\d+) d(-?\d+) f(-?\d+) t(-?\d+) m(-?\d+)$/);
  const grenades = text.match(/\sg(-?\d+)\/(-?\d+) w(?: |$)/);
  if (
    !Number.isSafeInteger(id) ||
    id < 0 ||
    id >= LIMITS.players ||
    !counters ||
    (!alive && !text.startsWith('dead ')) ||
    (alive && !grenades)
  )
    throw new Error('Malformed native player snapshot');
  const weaponRecords = [...text.matchAll(/\s([a-f\d]{1,8}):(-?\d+)(?= |$)/gi)].map((m) => ({
    definitionLow16: parseInt(m[1], 16),
    totalAndLoadedRounds: Number(m[2]),
  }));
  const values = [
    ...(alive?.slice(1).map(Number) ?? []),
    ...counters.slice(1).map(Number),
    ...(grenades?.slice(1).map(Number) ?? []),
    ...weaponRecords.flatMap((v) => Object.values(v)),
  ];
  if (
    values.some((v) => !Number.isFinite(v)) ||
    weaponRecords.length > 16 ||
    weaponRecords.some((v) => v.definitionLow16 > 0xffff)
  )
    throw new Error('Invalid numeric native player snapshot');
  return {
    id,
    alive: Boolean(alive),
    position: alive ? alive.slice(1, 4).map(Number) : null,
    health: alive ? Number(alive[4]) : null,
    shield: alive ? Number(alive[5]) : null,
    grenades: alive ? grenades.slice(1).map(Number) : null,
    weapons: alive ? weaponRecords : null,
    score: Number(counters[1]),
    kills: Number(counters[2]),
    deaths: Number(counters[3]),
    friendlyFireKills: Number(counters[4]),
    team: Number(counters[5]),
    machine: Number(counters[6]),
  };
}

function parseLog(input, role) {
  const lines = input.text.split(/\r?\n/),
    samples = [],
    markers = [],
    issues = [];
  if (lines.some((line) => line.length > LIMITS.lineLength)) throw new Error('Native log line exceeds bound');
  let lastTick = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index],
      lineNumber = index + 1;
    const tick = line.match(/^(?:halo-linux|chupathingyce): network test: tick (\d+)(.*?) \| items /);
    if (tick) {
      if (samples.length >= LIMITS.samples) throw new Error('Native sample count exceeds bound');
      const number = Number(tick[1]);
      if (!Number.isSafeInteger(number) || number <= lastTick || number > 0x7fffffff)
        throw new Error('Native ticks must increase within one game epoch');
      const players = [...tick[2].matchAll(/ player (\d+): (.*?)(?= player \d+:|$)/g)].map((m) =>
        parsePlayer(Number(m[1]), m[2].trimEnd()),
      );
      if (
        !players.length ||
        players.length > LIMITS.players ||
        new Set(players.map((p) => p.id)).size !== players.length
      )
        throw new Error('Invalid native player roster');
      const item = line.match(/\| items (\d+) \(\+(\d+) -(\d+) !(\d+) x(\d+)\)/);
      const net = line.match(/\| sent (\d+) received (\d+) corrected (\d+)/);
      const damage = line.match(/\| hits (\d+) dealt (\d+) rejected (\d+) replayed (\d+)/);
      if (!item || !net || !damage) throw new Error('Incomplete native network snapshot');
      const localPlayer = line.match(/\| local (-?\d+) camera /);
      samples.push({
        tick: number,
        line: lineNumber,
        players,
        localPlayerId: localPlayer ? Number(localPlayer[1]) : null,
        items: Object.fromEntries(
          ['current', 'created', 'deleted', 'failed', 'removed'].map((k, i) => [k, Number(item[i + 1])]),
        ),
        network: { sent: Number(net[1]), received: Number(net[2]), corrections: Number(net[3]) },
        damage: {
          hits: Number(damage[1]),
          dealt: Number(damage[2]),
          rejected: Number(damage[3]),
          replayed: Number(damage[4]),
        },
        gameOver: line.includes('| game over '),
      });
      lastTick = number;
    } else if (NATIVE_PREFIX.test(line) && /network test: tick /.test(line)) {
      issues.push({ line: lineNumber, kind: 'unparsedSnapshot' });
    }
    const native = NATIVE_PREFIX.test(line);
    let kind;
    if (
      (native &&
        /cannot join|join (?:refused|rejected)|(?:older|newer) version of (?:the )?network code|incompatible.*(?:network|protocol)/i.test(
          line,
        )) ||
      /^You are on version \d+\. The host is on version \d+\./.test(line)
    )
      kind = 'joinRefusal';
    else if (
      native &&
      /\b(?:fatal|assertion failed|unhandled exception|error:|failed to (?:load|open|initialize)|cannot (?:load|open))\b/i.test(
        line,
      )
    )
      kind = 'error';
    else if (native && /exiting after debug\.exit_after/.test(line)) kind = 'timedExit';
    else if (native && /network test: player \d+ shoots player \d+/.test(line))
      kind = 'scriptedImpactDamageCue';
    else if (native && /network test: the first player kills the last/.test(line)) kind = 'forcedKillCue';
    else if (native && /network test: the host brings player/.test(line)) kind = 'scriptedRelocationCue';
    else if (native && /network test: hosting /.test(line)) kind = 'hosting';
    else if (native && /network test: searching for games/.test(line)) kind = 'searching';
    else if (native && /network test: joining$/.test(line)) kind = 'joining';
    else if (native && /network test: starting the game/.test(line)) kind = 'starting';
    else if (native && /\bDelta Peer:|OpenCE network version|Following OpenCE network version/.test(line))
      kind = 'protocol';
    else if (
      native &&
      /disconnect|timed? out|connection (?:lost|closed)|player.*(?:left|leaves)|leaving (?:the )?(?:game|session)/i.test(
        line,
      )
    )
      kind = 'departure';
    if (kind) {
      const shot = line.match(/network test: player (\d+) shoots player (\d+)/);
      markers.push({
        kind,
        line: lineNumber,
        message: cleanMessage(line),
        ...(shot ? { actorId: Number(shot[1]), targetId: Number(shot[2]) } : {}),
      });
    }
  }
  let cursor = 0;
  for (const marker of markers) {
    while (cursor < samples.length && samples[cursor].line < marker.line) cursor++;
    marker.afterTick = samples[cursor - 1]?.tick ?? null;
    marker.beforeTick = samples[cursor]?.tick ?? null;
  }
  return { role, samples, markers, issues, bytes: input.bytes, sha256: input.sha256 };
}

function statistics(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    minimum: round(sorted[0]),
    median: round(sorted[Math.floor(sorted.length / 2)]),
    p95: round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]),
    maximum: round(sorted.at(-1)),
  };
}

function matchSamples(host, client, window) {
  const pairs = [];
  let cursor = 0;
  for (const c of client) {
    while (cursor < host.length && host[cursor].tick < c.tick - window) cursor++;
    let best = -1;
    for (let j = cursor; j < host.length && host[j].tick <= c.tick + window; j++)
      if (best < 0 || Math.abs(host[j].tick - c.tick) < Math.abs(host[best].tick - c.tick)) best = j;
    if (best >= 0) {
      pairs.push({ host: host[best], client: c });
      cursor = best + 1;
    }
  }
  return pairs;
}

function compare(pairs, window) {
  const fields = Object.fromEntries(
    STATE_FIELDS.map((k) => [k, { compared: 0, agree: 0, notComparable: 0 }]),
  );
  const disagreements = [],
    missingPlayers = [],
    grenadeDifferences = [],
    weaponDifferences = [],
    itemDifferences = [];
  const positions = [],
    deltaTicks = {},
    playerIds = new Set();
  let grenadeCompared = 0,
    weaponCompared = 0,
    playerComparisons = 0;
  function followingSample(pairIndex, id, key) {
    const next = pairs[pairIndex + 1];
    const h = next?.host.players.find((p) => p.id === id),
      c = next?.client.players.find((p) => p.id === id);
    if (
      !h ||
      !c ||
      ((key === 'health' || key === 'shield' || key === 'grenades' || key === 'weapons') &&
        (!h.alive || !c.alive))
    )
      return null;
    return { hostTick: next.host.tick, clientTick: next.client.tick, agrees: same(h[key], c[key]) };
  }
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
    const { host, client } = pairs[pairIndex];
    const delta = host.tick - client.tick;
    deltaTicks[delta] = (deltaTicks[delta] ?? 0) + 1;
    const ids = new Set([...host.players, ...client.players].map((p) => p.id));
    for (const id of ids) {
      const h = host.players.find((p) => p.id === id),
        c = client.players.find((p) => p.id === id);
      if (!h || !c) {
        missingPlayers.push({
          hostTick: host.tick,
          clientTick: client.tick,
          id,
          missingFrom: h ? 'client' : 'host',
        });
        continue;
      }
      playerComparisons++;
      playerIds.add(id);
      const differences = {};
      for (const key of STATE_FIELDS) {
        if ((key === 'health' || key === 'shield') && (!h.alive || !c.alive)) {
          fields[key].notComparable++;
          continue;
        }
        fields[key].compared++;
        if (h[key] === c[key]) fields[key].agree++;
        else
          differences[key] = {
            host: h[key],
            client: c[key],
            nextObservation: followingSample(pairIndex, id, key),
          };
      }
      if (Object.keys(differences).length)
        disagreements.push({ hostTick: host.tick, clientTick: client.tick, id, fields: differences });
      if (h.position && c.position) {
        const next = pairs[pairIndex + 1],
          nh = next?.host.players.find((p) => p.id === id),
          nc = next?.client.players.find((p) => p.id === id);
        positions.push({
          hostTick: host.tick,
          clientTick: client.tick,
          id,
          deltaWorldUnits: distance(h.position, c.position),
          host: h.position,
          client: c.position,
          sameDeathCount: h.deaths === c.deaths,
          nextObservation:
            nh?.position && nc?.position
              ? {
                  hostTick: next.host.tick,
                  clientTick: next.client.tick,
                  deltaWorldUnits: round(distance(nh.position, nc.position)),
                }
              : null,
        });
      }
      if (h.alive && c.alive) {
        grenadeCompared++;
        weaponCompared++;
        if (!same(h.grenades, c.grenades))
          grenadeDifferences.push({
            hostTick: host.tick,
            clientTick: client.tick,
            id,
            host: h.grenades,
            client: c.grenades,
            nextObservation: followingSample(pairIndex, id, 'grenades'),
          });
        if (!same(h.weapons, c.weapons))
          weaponDifferences.push({
            hostTick: host.tick,
            clientTick: client.tick,
            id,
            host: h.weapons,
            client: c.weapons,
            nextObservation: followingSample(pairIndex, id, 'weapons'),
          });
      }
    }
    if (host.items.current !== client.items.current)
      itemDifferences.push({
        hostTick: host.tick,
        clientTick: client.tick,
        host: host.items.current,
        client: client.items.current,
      });
  }
  return {
    tickWindow: window,
    samplePairs: pairs.length,
    tickDifferenceHistogram: deltaTicks,
    playerComparisons,
    playerIds: [...playerIds].sort((a, b) => a - b),
    stateFields: fields,
    missingPlayers: detail(missingPlayers),
    stateDisagreements: detail(disagreements),
    positionDeltas: [...playerIds]
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        ...statistics(positions.filter((p) => p.id === id).map((p) => p.deltaWorldUnits)),
      })),
    largestPositionDeltas: positions
      .toSorted((a, b) => b.deltaWorldUnits - a.deltaWorldUnits)
      .slice(0, 8)
      .map((p) => ({ ...p, deltaWorldUnits: round(p.deltaWorldUnits) })),
    grenades: { compared: grenadeCompared, differences: detail(grenadeDifferences) },
    weapons: {
      compared: weaponCompared,
      differences: detail(weaponDifferences),
      meaning:
        'Ordered present-slot tag-index low 16 bits and total-plus-loaded rounds; not a complete inventory or universal tag identity.',
    },
    groundItemCountDifferences: detail(itemDifferences),
  };
}

function transitions(run) {
  const events = [],
    movement = [],
    shieldDecreases = [],
    observedDeaths = [],
    observedRespawns = [],
    scoreChanges = [];
  const ids = new Set(run.samples.flatMap((s) => s.players.map((p) => p.id)));
  for (const id of ids) {
    let previous,
      movingIntervals = 0,
      greatestAdjacent = 0,
      aliveSamples = 0;
    const points = [];
    for (const sample of run.samples) {
      const p = sample.players.find((v) => v.id === id);
      if (!p) {
        previous = undefined;
        continue;
      }
      if (p.position) {
        aliveSamples++;
        points.push(p.position);
      }
      if (previous) {
        const q = previous.player;
        const changed = STATE_FIELDS.filter((k) => p[k] !== q[k]);
        if (changed.some((k) => ['alive', 'score', 'kills', 'deaths', 'health', 'shield'].includes(k)))
          events.push({
            id,
            afterTick: previous.tick,
            byTick: sample.tick,
            changed,
            alive: p.alive,
            health: p.health,
            shield: p.shield,
            score: p.score,
            kills: p.kills,
            deaths: p.deaths,
          });
        const timing = { id, afterTick: previous.tick, byTick: sample.tick };
        if (p.alive && q.alive && p.shield < q.shield)
          shieldDecreases.push({ ...timing, before: q.shield, after: p.shield });
        if (p.deaths > q.deaths) observedDeaths.push({ ...timing, before: q.deaths, after: p.deaths });
        if (p.alive && !q.alive) observedRespawns.push(timing);
        if (p.score !== q.score) scoreChanges.push({ ...timing, before: q.score, after: p.score });
        if (p.position && q.position && p.deaths === q.deaths) {
          const displacement = distance(p.position, q.position);
          if (displacement > 0) movingIntervals++;
          greatestAdjacent = Math.max(greatestAdjacent, displacement);
        }
      }
      previous = { tick: sample.tick, player: p };
    }
    movement.push({
      id,
      aliveSamples,
      movingSameLifeSampleIntervals: movingIntervals,
      greatestAdjacentSameLifeDisplacement: round(greatestAdjacent),
      bounds: points.length
        ? [0, 1, 2].map((axis) => ({
            min: Math.min(...points.map((p) => p[axis])),
            max: Math.max(...points.map((p) => p[axis])),
          }))
        : null,
      includesScriptedRelocations: run.markers.some((m) => m.kind === 'scriptedRelocationCue'),
    });
  }
  return {
    stateTransitions: detail(events),
    movement,
    shieldDecreases: detail(shieldDecreases),
    observedDeaths: detail(observedDeaths),
    observedRespawns: detail(observedRespawns),
    scoreChanges: detail(scoreChanges),
  };
}

function executionRecord(entry) {
  const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const duration =
    validTime(entry.startedAt) && validTime(entry.exitedAt)
      ? (Date.parse(entry.exitedAt) - Date.parse(entry.startedAt)) / 1000
      : null;
  const settings = entry.settings ?? {};
  return {
    role: entry.role,
    runtime: boundedString(entry.runtime),
    executableSha256FromReceipt: /^[a-f\d]{64}$/.test(entry.exeSha256 ?? '') ? entry.exeSha256 : null,
    wallDurationSeconds: round(duration),
    exitCode: entry.exitCode ?? null,
    signal: entry.signal ?? null,
    forced: entry.forced ?? null,
    inputsUnchangedFromReceipt: entry.inputsUnchanged ?? null,
    networkTest: boundedString(settings.HALO_NETWORK_TEST),
    scriptedInput: boundedString(settings.HALO_TEST_INPUT),
    impactCueInterval: boundedString(settings.HALO_NETWORK_TEST_SHOOT),
    forcedKillCueInterval: boundedString(settings.HALO_NETWORK_TEST_KILL),
    rendererSettings: {
      null: boundedString(settings.HALO_NULL_RENDERER),
      hidden: boundedString(settings.HALO_HIDDEN_WINDOW),
      audioDriver: boundedString(settings.SDL_AUDIO_DRIVER),
      videoDriver: boundedString(settings.SDL_VIDEO_DRIVER),
    },
    inputs: Array.isArray(entry.inputs)
      ? entry.inputs.slice(0, 256).map((v) => ({
          name: /^[\w .-]{1,128}$/.test(v.name ?? '') ? v.name : '[unrecognized name]',
          bytes: Number.isSafeInteger(v.bytes) ? v.bytes : null,
          sha256: /^[a-f\d]{64}$/.test(v.sha256 ?? '') ? v.sha256 : null,
          cacheVersion: Number.isSafeInteger(v.cacheVersion) ? v.cacheVersion : null,
        }))
      : [],
  };
}

export function analyzeRun(directory) {
  const root = path.resolve(directory),
    receiptInput = readBounded(root, 'execution.json', LIMITS.receiptBytes);
  const receipt = JSON.parse(receiptInput.text);
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    receipt.schemaVersion !== 1 ||
    !Array.isArray(receipt.executed) ||
    receipt.executed.length !== 2 ||
    !Array.isArray(receipt.errors)
  )
    throw new Error('Expected bounded execution metadata with an executed array');
  const entries = ['host', 'client'].map((role) => {
    const matches = receipt.executed.filter((v) => v && v.role === role);
    if (matches.length !== 1) throw new Error('Expected exactly one execution record for ' + role);
    return matches[0];
  });
  const roles = ['host', 'client'].map((role) =>
    parseLog(readBounded(root, role + '/stdio.log', LIMITS.logBytes), role),
  );
  const [host, client] = roles,
    records = entries.map(executionRecord);
  const exact = compare(matchSamples(host.samples, client.samples, 0), 0);
  const phase = compare(matchSamples(host.samples, client.samples, LIMITS.phaseTicks), LIMITS.phaseTicks);
  const selected = phase.samplePairs > exact.samplePairs ? phase : exact;
  const issues = roles.flatMap((r) => r.issues.map((i) => ({ role: r.role, ...i })));
  if (receipt.private !== true || receipt.publicListing !== false || receipt.routerFirewallChanges !== false)
    issues.push({ kind: 'privateRunScopeUnestablished' });
  if (receipt.errors?.length) issues.push({ kind: 'runnerReportedErrors', count: receipt.errors.length });
  for (const record of records) {
    if (record.exitCode !== 0 || record.signal || record.forced !== false)
      issues.push({ role: record.role, kind: 'abnormalOrUnestablishedExit' });
    if (record.inputsUnchangedFromReceipt !== true)
      issues.push({ role: record.role, kind: 'inputIntegrityUnestablished' });
    if (!record.executableSha256FromReceipt)
      issues.push({ role: record.role, kind: 'executableIdentityUnestablished' });
  }
  const refusal = roles.flatMap((r) =>
    r.markers.filter((m) => m.kind === 'joinRefusal').map((m) => ({ role: r.role, ...m })),
  );
  const errors = roles.flatMap((r) =>
    r.markers.filter((m) => m.kind === 'error').map((m) => ({ role: r.role, ...m })),
  );
  const joinMarkers =
    host.markers.some((m) => m.kind === 'hosting') && client.markers.some((m) => m.kind === 'joining');
  const packetExchange = roles.every((r) =>
    r.samples.some((s) => s.network.sent > 0 && s.network.received > 0),
  );
  const twoMachinePlayers =
    selected.playerIds.length >= 2 &&
    roles.every((r) => r.samples.some((s) => new Set(s.players.map((p) => p.machine)).size >= 2));
  let status = 'sampled-native-simulation';
  if (refusal.length) status = 'join-refused';
  else if (issues.length || errors.length) status = 'invalid-or-failed-evidence';
  else if (!joinMarkers || !packetExchange || !twoMachinePlayers || selected.samplePairs < 3)
    status = 'simulation-not-established';
  else if (selected.stateDisagreements.total || selected.missingPlayers.total)
    status = 'sampled-state-disagreement';
  const lastClient = client.samples.at(-1),
    continuation = lastClient ? host.samples.filter((s) => s.tick > lastClient.tick) : [];
  const firstGameOver = continuation.find((s) => s.gameOver),
    lastHost = host.samples.at(-1);
  const clientLocalPlayerIds = new Set(
    client.samples.flatMap((s) => (s.localPlayerId === null ? [] : [s.localPlayerId])),
  );
  const wallExitGap = entries.every(
    (e) => typeof e.exitedAt === 'string' && Number.isFinite(Date.parse(e.exitedAt)),
  )
    ? (Date.parse(entries[0].exitedAt) - Date.parse(entries[1].exitedAt)) / 1000
    : null;
  return {
    schemaVersion: 1,
    analyzer: 'analyze-community-runtime-native',
    run: {
      label: boundedString(receipt.label) ?? path.basename(root),
      mode: boundedString(receipt.mode),
      privateFromReceipt: receipt.private ?? null,
      humanInputFromReceipt: receipt.humanInput ?? null,
      twoComputersFromReceipt: receipt.twoComputers ?? null,
      publicListingFromReceipt: receipt.publicListing ?? null,
      routerFirewallChangesFromReceipt: receipt.routerFirewallChanges ?? null,
      rendererFromReceipt: boundedString(receipt.renderer),
    },
    provenance: {
      analyzerSourceSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
      execution: { path: 'execution.json', bytes: receiptInput.bytes, sha256: receiptInput.sha256 },
      records,
      logs: roles.map((r) => ({
        role: r.role,
        path: r.role + '/stdio.log',
        bytes: r.bytes,
        sha256: r.sha256,
        samples: r.samples.length,
        firstTick: r.samples[0]?.tick ?? null,
        lastTick: r.samples.at(-1)?.tick ?? null,
        localPlayerIds: [
          ...new Set(r.samples.flatMap((s) => (s.localPlayerId === null ? [] : [s.localPlayerId]))),
        ],
      })),
      boundary:
        'Hashes bind this analysis to these files; executable signatures, actual processes and preserved content are not independently authenticated by this log analyzer.',
    },
    verdict: {
      status,
      selectedComparison: selected === exact ? 'exactTicks' : 'nearPhaseTicks',
      joinMarkersObserved: joinMarkers,
      bidirectionalPacketCountersObserved: packetExchange,
      atLeastTwoMachinePlayersObserved: twoMachinePlayers,
      completeInventoryParity: false,
      humanPlayAccepted: false,
      aiActorAcceptance: false,
      twoComputerAcceptance: false,
      renderingOrAudioAcceptance: false,
      universalCrossRuntimeCompatibility: false,
      listingGateChangeAuthorized: false,
    },
    comparisons: {
      nominalTickRateHz: 30,
      exactTicks: exact,
      nearPhaseTicks: phase,
      timing:
        'Near-phase pairs are monotonic and one-to-one, within two ticks (about 67 ms at nominal 30 Hz). This comparison aid is not an approved network latency or position tolerance. Logs sample about once per second; matching printed values have only their printed precision.',
    },
    roles: roles.map((r) => ({
      role: r.role,
      ...transitions(r),
      markers: detail(r.markers),
      nativeImpactDamageCues: r.markers.filter((m) => m.kind === 'scriptedImpactDamageCue').length,
      forcedKillCues: r.markers.filter((m) => m.kind === 'forcedKillCue').length,
      finalDamageCounters: r.samples.at(-1)?.damage ?? null,
      finalItemCounters: r.samples.at(-1)?.items ?? null,
      finalNetworkCounters: r.samples.at(-1)?.network ?? null,
      finalScoreboard:
        r.samples.at(-1)?.players.map(({ id, alive, score, kills, deaths, team, machine }) => ({
          id,
          alive,
          score,
          kills,
          deaths,
          team,
          machine,
        })) ?? [],
    })),
    departure: {
      clientTimedExitMarker: client.markers.some((m) => m.kind === 'timedExit'),
      hostTimedExitMarker: host.markers.some((m) => m.kind === 'timedExit'),
      hostExitAfterClientWallSecondsFromReceipt: round(wallExitGap),
      hostProcessOutlivedClientFromReceipt: wallExitGap === null ? null : wallExitGap > 0,
      postExitSimulationDirectlyWallTimestamped: false,
      hostSamplesAfterLastClientSample: continuation.length,
      additionalHostTicksAfterLastClientSample: continuation.length ? lastHost.tick - lastClient.tick : 0,
      firstPostClientGameOverTick: firstGameOver?.tick ?? null,
      continuedActiveMatchEstablished: false,
      explicitGracefulInGameLeaveEstablished: false,
      retainedClientScoreboardEntry: continuation.some((s) =>
        s.players.some((p) => clientLocalPlayerIds.has(p.id) && !p.alive),
      ),
      note: 'Continued ticks and app exit receipts are separate from a graceful in-game leave, reusable lobby, active match or reconnect acceptance. A retained dead entry without an increased death count is not an additional combat death.',
    },
    refusals: detail(refusal),
    errors: detail(errors),
    issues: detail(issues),
    limitations: [
      'Upstream SHOOT cues apply native weapon-impact damage; they do not establish trigger input, projectile flight, aiming or visible firing. KILL cues separately force a scoring death.',
      'Scripted player input is not human gameplay or campaign AI. Sampled counters do not certify complete state, physics, animation, rendering, audio, scale or multiplayer limits.',
      'Position differences are measured without a pass threshold. Grenades, ordered weapon records and item count differences remain explicit; role-local cumulative counters need not equal. A score of -1 can mean that the game has no score callback, so equal -1 values do not establish scoring behavior.',
      'No signed Delta compatibility table or local runtime/content attestation is supplied or accepted here. A same-runtime run cannot authorize OpenCE/Chupathingy mixed compatibility or relax the listing gate.',
    ],
  };
}

function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(
      'Usage: node scripts/analyze-community-runtime-native.mjs --run <pair-directory>\nRead-only metadata analysis. Exit 0: sampled state agrees; 2: refusal, absent evidence or disagreement; 1: invalid input.\n',
    );
    return;
  }
  if (args.length !== 2 || args[0] !== '--run' || !args[1]) throw new Error('Use --run <pair-directory>');
  const report = analyzeRun(args[1]);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.verdict.status !== 'sampled-native-simulation') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: 1,
          verdict: { status: 'analysis-error' },
          error: cleanMessage(error instanceof Error ? error.message : 'Unknown analysis error'),
        },
        null,
        2,
      ) + '\n',
    );
    process.exitCode = 1;
  }
}
