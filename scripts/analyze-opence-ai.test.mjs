import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActorObservation,
  compareActorObservations,
  analyzeActors,
  OPEN_CE_AI,
} from './analyze-opence-ai.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const none = 0xffffffff,
  record = { role: 'host', pid: 123 };
const actor = {
  id: 0xe0010001,
  tag: 0xe0020002,
  actorId: 0xe0030003,
  playerId: none,
  parentId: none,
  seat: 65535,
  team: 2,
  position: [0, 0, 0],
  throttle: [1, 0, 0],
  trigger: 0,
  health: 1,
  shield: 1,
  damageFlags: 0,
  controlFlags: 0,
  receivedTick: null,
  impulse: 65535,
  impulseSequence: 0,
  speechTag: none,
  speechSequence: 0,
};
const state = { localTick: 60, serverTick: 60, actorPoolCount: 1, networkActorCount: 1, actors: [actor] };
const header = {
  schemaVersion: 1,
  runtime: 'opence-build-335',
  role: 'host',
  pid: 123,
  readOnly: true,
  exeSha256: OPEN_CE_AI.exe,
  pdbSha256: OPEN_CE_AI.pdb,
  pdb: { symType: 3, pdbUnmatched: 0, pdbAge: 1 },
};
const text = (h = header, s = state, footer = { completed: true, inputsRechecked: true }) =>
  [h, { sample: 0, elapsedMs: 5, state: s }, footer].map((x) => JSON.stringify(x)).join('\n');
test('refuses mismatched identity, incomplete readback, duplicate actors and nonfinite state', () => {
  assert.equal(parseActorObservation(text(), record).samples.length, 1);
  assert.throws(
    () => parseActorObservation(text({ ...header, pdbSha256: '0'.repeat(64) }), record),
    /identity/,
  );
  assert.throws(() => parseActorObservation(text(header, state, {}), record), /readback/);
  assert.throws(
    () =>
      parseActorObservation(text(header, { ...state, networkActorCount: 2, actors: [actor, actor] }), record),
    /duplicate/,
  );
  assert.throws(
    () =>
      parseActorObservation(
        text(header, { ...state, actors: [{ ...actor, position: [NaN, 0, 0] }] }),
        record,
      ),
    /Invalid/,
  );
});
test('retains actor discrepancies and never promotes telemetry to full AI acceptance', () => {
  const h = parseActorObservation(text(), record),
    c = {
      samples: [
        {
          ...state,
          actorPoolCount: 0,
          actors: [{ ...actor, actorId: none, position: [5, 0, 0], receivedTick: 59 }],
        },
      ],
    };
  const r = compareActorObservations(h, c);
  assert.equal(r.sharedActualActorIds, 1);
  assert.equal(r.position.maximum, 5);
  assert.equal(r.largePositionDifferences.total, 1);
  assert.equal(r.hostAuthorityObserved, true);
  assert.equal(r.aiActorAcceptance, false);
  assert.equal(
    compareActorObservations(h, { samples: [{ ...state, actorPoolCount: 1 }] }).hostAuthorityObserved,
    false,
  );
});
test('a player unit or missing client control does not establish an AI identity', () => {
  const h = { samples: [{ ...state, actors: [{ ...actor, playerId: 77 }] }] },
    c = { samples: [{ ...state, actorPoolCount: 0, actors: [{ ...actor, actorId: none }] }] };
  assert.equal(compareActorObservations(h, c).sharedActualActorIds, 0);
  assert.equal(compareActorObservations({ samples: [state] }, { samples: [] }).hostAuthorityObserved, false);
});

test('repeated frozen ticks do not inflate pairs or weight an unchanged frame repeatedly', () => {
  const at = (tick, position, client = false) => ({
    ...state,
    localTick: tick,
    serverTick: tick,
    actorPoolCount: client ? 0 : 1,
    actors: [{ ...actor, actorId: client ? none : actor.actorId, position }],
  });
  const h = { samples: [at(60, [0, 0, 0]), at(61, [0, 0, 0]), at(61, [1, 0, 0])] };
  const c = { samples: [at(60, [0, 0, 0], true), ...new Array(20).fill(at(61, [6, 0, 0], true))] };
  const r = compareActorObservations(h, c);
  assert.equal(r.exactTickFrames, 2);
  assert.equal(r.position.count, 2);
  assert.equal(r.position.maximum, 5);
  assert.equal(r.observationCoverage.hostRepeatedTickObservations, 1);
  assert.equal(r.observationCoverage.clientRepeatedTickObservations, 19);
  assert.equal(r.aiActorAcceptance, false);
});

test('a map restart cannot pair repeated numeric ticks across actor lifetimes',()=>{
  const at=(tick,client=false)=>({...state,localTick:tick,serverTick:tick,actorPoolCount:client?0:1,
    actors:[{...actor,actorId:client?none:actor.actorId}]});
  const host={samples:[at(60),at(61),at(1),at(60)]};
  const client={samples:[at(60,true),at(61,true)]};
  const result=compareActorObservations(host,client);
  assert.equal(result.tickContinuity.pairable,false);
  assert.equal(result.tickContinuity.host.discontinuities,1);
  assert.equal(result.exactTickFrames,0);assert.equal(result.sharedActualActorIds,0);
  assert.equal(result.position,null);assert.equal(result.hostAuthorityObserved,false);
  assert.equal(result.observationCoverage.hostObservations,4);
  assert.equal(result.observationCoverage.hostRepeatedTickObservations,0);
  assert.equal(result.fullLifecycleAcceptance,false);
});

test('client reconnect and uint32 wrap require a fresh scoped observation',()=>{
  for(const clientSamples of [
    [{...state,localTick:60},{...state,localTick:1}],
    [{...state,serverTick:0xffffffff,localTick:0xffffffff},{...state,serverTick:0,localTick:0}],
  ]) {
    const result=compareActorObservations({samples:[state]},{samples:clientSamples});
    assert.equal(result.tickContinuity.pairable,false);
    assert.equal(result.tickContinuity.client.discontinuities,1);
    assert.equal(result.exactTickFrames,0);assert.equal(result.aiActorAcceptance,false);
  }
});

test('missing and mismatched identities are reported outside matched-pair distributions', () => {
  const second = { ...actor, id: actor.id + 1 };
  const h = {
    samples: [
      { ...state, actors: [actor, second] },
      { ...state, serverTick: 61, actors: [actor] },
    ],
  };
  const c = {
    samples: [
      { ...state, actors: [{ ...actor, actorId: none, tag: actor.tag + 1 }] },
      {
        ...state,
        serverTick: 61,
        actors: [
          { ...second, actorId: none },
          { ...second, id: 99, actorId: none },
        ],
      },
      { ...state, serverTick: 62, actors: [] },
    ],
  };
  const r = compareActorObservations(h, c);
  assert.equal(r.sharedActualActorIds, 0);
  assert.equal(r.identityCoverage.hostAiUnitTicks, 3);
  assert.equal(r.identityCoverage.missingClientUnitTicks, 2);
  assert.equal(r.identityCoverage.mismatchedTagUnitTicks, 1);
  assert.equal(r.identityCoverage.knownAiMissingHostUnitTicks, 1);
  assert.equal(r.identityCoverage.unclassifiedClientUnitTicks, 1);
  assert.equal(r.observationCoverage.clientTicksWithoutHostPair, 1);
  assert.equal(r.fullLifecycleAcceptance, false);
});

test('parent-local and world positions remain distinguished without hiding raw deltas', () => {
  const h = {
    samples: [
      state,
      { ...state, serverTick: 61, actors: [{ ...actor, parentId: 45 }] },
      { ...state, serverTick: 62, actors: [{ ...actor, parentId: 45 }] },
    ],
  };
  const c = {
    samples: [
      { ...state, actors: [{ ...actor, actorId: none, position: [1, 0, 0] }] },
      { ...state, serverTick: 61, actors: [{ ...actor, actorId: none, parentId: 45, position: [2, 0, 0] }] },
      { ...state, serverTick: 62, actors: [{ ...actor, actorId: none, position: [200, 0, 0] }] },
    ],
  };
  const r = compareActorObservations(h, c);
  assert.equal(r.position.count, 3);
  assert.equal(r.position.maximum, 200);
  assert.equal(r.worldSpacePosition.maximum, 1);
  assert.equal(r.sameParentLocalPosition.maximum, 2);
  assert.equal(r.positionCoordinateScope.differentParentPairs, 1);
  assert.equal(r.parentOrSeatDifferences, 1);
});

test('a bad repeated-tick observation is rejected before comparison selection', () => {
  const log = [
    header,
    { sample: 0, elapsedMs: 5, state },
    { sample: 1, elapsedMs: 6, state: { ...state, actors: [{ ...actor, position: [2000000, 0, 0] }] } },
    { sample: 2, elapsedMs: 7, state },
    { completed: true, inputsRechecked: true },
  ]
    .map(JSON.stringify)
    .join('\n');
  assert.throws(() => parseActorObservation(log, record), /Invalid native actor position at sample 1/);
});

test('optional detailed native census validates identities, field widths and contents', () => {
  const details = {
    aiProfileDisabled: 0,
    actorPool: [
      {
        id: actor.actorId,
        unitId: actor.id,
        actorTag: 3,
        variantTag: 4,
        active: 1,
        frozen: 0,
        dormant: 0,
        eraseNextTick: 0,
        encounterless: 1,
        team: 2,
        mode: 2,
        action: 0,
        combatStatus: 0,
      },
    ],
    objects: [
      {
        id: actor.id,
        type: 0,
        tag: actor.tag,
        parentId: none,
        flags: 0,
        position: [1, 2, 3],
        velocity: [0, 0, 0],
        health: 1,
        shield: 0,
        damageFlags: 0,
        team: 2,
        unit: {
          actorId: actor.actorId,
          playerId: none,
          flags: 0,
          seat: 65535,
          controlFlags: 2048,
          throttle: [0, 0, 0],
        },
      },
    ],
  };
  const h = { ...header, detailedCensus: true },
    s = { ...state, details };
  assert.equal(parseActorObservation(text(h, s), record).samples[0].details.objects.length, 1);
  assert.throws(() => parseActorObservation(text(header, s), record), /census/);
  for (const broken of [
    { ...details, actorPool: [] },
    { ...details, aiProfileDisabled: 4 },
    { ...details, objects: [details.objects[0], details.objects[0]] },
    { ...details, objects: [{ ...details.objects[0], position: [NaN, 0, 0] }] },
    {
      ...details,
      objects: [{ ...details.objects[0], unit: { ...details.objects[0].unit, controlFlags: 65536 } }],
    },
  ])
    assert.throws(() => parseActorObservation(text(h, { ...state, details: broken }), record), /Invalid/);
});

test('failed-run diagnostics retain exit failure without weakening observer/source checks', () => {
  // Synthetic file fixtures test the parser contract, not native gameplay.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-failed-ai-'));
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const receipt = {
    schemaVersion: 1,
    private: true,
    publicListing: false,
    routerFirewallChanges: false,
    originalInputMapsUnchanged: true,
    errors: ['host did not exit cleanly'],
    executed: [],
  };
  const save = () => fs.writeFileSync(path.join(root, 'execution.json'), JSON.stringify(receipt));
  try {
    for (const [i, role] of ['host', 'client'].entries()) {
      fs.mkdirSync(path.join(root, role));
      const observed = text(
        { ...header, role, pid: 123 + i },
        role === 'host' ? state : { ...state, actorPoolCount: 0, actors: [{ ...actor, actorId: none }] },
      );
      fs.writeFileSync(path.join(root, role, 'ai-observer.ndjson'), observed);
      fs.writeFileSync(path.join(root, role, 'stdio.log'), '');
      receipt.executed.push({
        role,
        pid: 123 + i,
        runtime: 'opence-build-335',
        exeSha256: OPEN_CE_AI.exe,
        exitCode: i === 0 ? 3221225477 : 0,
        forced: false,
        inputsUnchanged: true,
        aiObserver: {
          exitCode: 0,
          forced: false,
          readOnly: true,
          pdbSha256: OPEN_CE_AI.pdb,
          sha256: '1'.repeat(64),
          logSha256: sha(observed),
        },
      });
    }
    save();
    assert.throws(() => analyzeActors(root), /receipt/);
    const diagnostic = analyzeActors(root, { diagnosticOnly: true });
    assert.equal(diagnostic.diagnosticOnly, true);
    assert.equal(diagnostic.failedExecution.processes[0].exitCode, 3221225477);
    assert.equal(diagnostic.failedExecution.acceptanceEligible, false);
    assert.equal(diagnostic.aiActorAcceptance, false);
    assert.equal(diagnostic.actorControlsObserved, false);
    assert.equal(diagnostic.nativeJoin.status, 'invalid-or-failed-evidence');
    assert.equal(diagnostic.comparison.sharedActualActorIds, 1);
    receipt.executed[0].forced = true;
    save();
    assert.throws(() => analyzeActors(root, { diagnosticOnly: true }), /observer/);
    receipt.executed[0].forced = false;
    receipt.executed[0].inputsUnchanged = false;
    save();
    assert.throws(() => analyzeActors(root, { diagnosticOnly: true }), /observer/);
    receipt.executed[0].inputsUnchanged = true;
    save();
    fs.appendFileSync(path.join(root, 'host', 'ai-observer.ndjson'), '\n{}');
    assert.throws(() => analyzeActors(root, { diagnosticOnly: true }), /checksum/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    assert(path.basename(root).startsWith('spark-failed-ai-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
