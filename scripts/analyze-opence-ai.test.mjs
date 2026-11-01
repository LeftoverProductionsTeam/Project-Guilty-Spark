import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActorObservation, compareActorObservations, OPEN_CE_AI } from './analyze-opence-ai.mjs';
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
