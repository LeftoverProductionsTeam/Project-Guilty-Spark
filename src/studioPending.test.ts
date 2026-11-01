import { it, expect } from 'vitest';
import { retainedStudioProposal, studioJoinDraft } from './studioPending';
import { mergeForge } from './forgeSession';
import type { QuickForgeDocument } from './forge';
const base: QuickForgeDocument = {
  schemaVersion: 1,
  name: 'Shared',
  template: 'customBlank',
  runtimeId: 'mccSteam',
  gameMode: 'slayer',
  skyPath: null,
  buildQuality: 'draft',
  geometry: [],
  materials: [],
  placements: [],
  spawns: [],
  objectives: [],
};
it('replays an uncertain acknowledgment verbatim before rebasing newer local edits', () => {
  const sent = { ...base, name: 'Acknowledged but response lost' },
    latest = { ...sent, skyPath: 'levels/sky' };
  const pending = {
    sessionId: 'same-session',
    operationId: 'original-operation',
    revision: 14,
    document: sent,
  };
  const selected = retainedStudioProposal('same-session', 15, latest, pending, () => {
    throw Error('Must not replace the pending ID');
  });
  expect(selected).toBe(pending);
  expect(selected.document).toBe(sent);
  expect(selected.revision).toBe(14);
  const reconciled = mergeForge(selected.document, latest, selected.document);
  expect(reconciled.name).toBe(sent.name);
  expect(reconciled.skyPath).toBe(latest.skyPath);
  expect(
    retainedStudioProposal('same-session', 15, reconciled, null, () => 'next-operation').operationId,
  ).toBe('next-operation');
});
it('retains another sessions pending edit for explicit review rather than overwriting it', () => {
  const pending = { sessionId: 'prior-session', operationId: 'unresolved', revision: 3, document: base };
  expect(() => retainedStudioProposal('new-session', 0, base, pending, () => 'new-id')).toThrow(
    /another session/,
  );
  expect(pending.operationId).toBe('unresolved');
  expect(pending.document).toBe(base);
});
it('rejoining preserves both the uncertain operation and edits made after it', () => {
  const sent = { ...base, name: 'First offline edit' };
  const local = { ...sent, skyPath: 'levels/later-local-sky' };
  const pending = { sessionId: 'same', operationId: 'original', revision: 7, document: sent };
  const resumed = studioJoinDraft('same', base, local, pending);
  expect(resumed.document).toBe(local);
  expect(resumed.parked).toBe(false);
  expect(retainedStudioProposal('same', 7, resumed.document, pending, () => 'wrong')).toBe(pending);
  const afterAck = mergeForge(sent, resumed.document, sent);
  expect(afterAck.name).toBe('First offline edit');
  expect(afterAck.skyPath).toBe('levels/later-local-sky');
});
it('joining cannot silently resurrect a draft the user set aside for the shared version', () => {
  const pending = {
    sessionId: 'same',
    operationId: 'original',
    revision: 7,
    document: { ...base, name: 'Set aside' },
  };
  const resumed = studioJoinDraft('same', base, { ...base }, pending);
  expect(resumed.document).toEqual(base);
  expect(resumed.parked).toBe(true);
  expect(pending.document.name).toBe('Set aside');
});
it('another session parks the retained operation while joining its own source', () => {
  const pending = {
    sessionId: 'earlier',
    operationId: 'original',
    revision: 7,
    document: { ...base, name: 'Earlier draft' },
  };
  const local = { ...pending.document, skyPath: 'levels/local' };
  const shared = { ...base, name: 'Another session' };
  const resumed = studioJoinDraft('new', shared, local, pending);
  expect(resumed.document).toBe(shared);
  expect(resumed.parked).toBe(true);
  expect(pending.document.name).toBe('Earlier draft');
});
