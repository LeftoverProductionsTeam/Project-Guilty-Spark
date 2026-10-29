import { describe, expect, it, vi } from 'vitest';
import type { MapInspection, Project } from './types';
import {
  ExternalMapSyncController,
  hasSourceBoundEdits,
  type ExternalMapDocument,
  type ExternalRevision,
  type ExternalSyncBridge,
  type ExternalWatchReport,
} from './externalMapSync';

function document(id = 'old', hash = 'a'.repeat(64)): ExternalMapDocument {
  const project: Project = {
    schemaVersion: 1,
    id,
    title: id,
    createdAt: '',
    modifiedAt: '',
    source: {
      originalPath: 'C:/synthetic/working.map',
      preservedPath: 'C:/synthetic/preserved.map',
      sha256: hash,
      cacheVersion: 7,
      engine: 'fixture',
      scenarioPath: 'levels/fixture',
    },
    provenance: {
      creator: '',
      community: '',
      releaseYear: null,
      description: '',
      sourceUrl: '',
      permissions: '',
    },
    scene: [],
    assets: [],
    tagEdits: [],
    history: [],
    builds: [],
  };
  return { project, inspection: { sha256: hash, objects: [] } as unknown as MapInspection, dirty: false };
}
function report(): ExternalWatchReport {
  return {
    watchId: 'watch',
    projectId: 'old',
    path: 'C:/synthetic/working.map',
    status: 'changed',
    candidate: {
      sha256: 'b'.repeat(64),
      cacheVersion: 7,
      scenarioPath: 'levels/fixture',
      fileSize: 4096,
      matchesSource: true,
    },
    message: 'Stable external fixture',
  };
}
function imported(): ExternalRevision {
  const next = document('new', 'b'.repeat(64));
  return {
    previousProjectId: 'old',
    watchedPath: 'C:/synthetic/working.map',
    opened: { project: next.project, inspection: next.inspection },
    deduplicated: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(bridgeOverrides: Partial<ExternalSyncBridge> = {}) {
  let documents = [document()];
  const revision = vi.fn(),
    errors = vi.fn(),
    reports = vi.fn();
  const bridge: ExternalSyncBridge = {
    start: vi.fn(async () => report()),
    poll: vi.fn(async () => report()),
    stop: vi.fn(async () => {}),
    import: vi.fn(async () => imported()),
    ...bridgeOverrides,
  };
  const controller = new ExternalMapSyncController(bridge, {
    documents: () => documents,
    report: reports,
    error: errors,
    revision,
  });
  return {
    controller,
    bridge,
    revision,
    errors,
    reports,
    get: () => documents,
    set: (next: ExternalMapDocument[]) => {
      documents = next;
    },
  };
}

describe('external map revision monitoring', () => {
  it('counts saved tag and scene authoring as conflicts even when dirty is false', () => {
    const value = document();
    expect(hasSourceBoundEdits(value.project, value.inspection)).toBe(false);
    value.project.tagEdits.push({ tagId: 1, fieldKey: 'radius', value: 2 });
    expect(hasSourceBoundEdits(value.project, value.inspection)).toBe(true);
    value.project.tagEdits = [];
    value.project.scene.push({
      id: 'added',
      name: 'authored',
      kind: 'Scenery',
      tagId: 3,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      sourceOffset: null,
      rotationOffset: null,
      assetId: null,
    });
    expect(hasSourceBoundEdits(value.project, value.inspection)).toBe(true);
  });
  it('automatically adopts only a clean matching source and keeps its original object unchanged', async () => {
    const value = setup(),
      old = value.get()[0].project;
    await value.controller.poll();
    expect(value.bridge.import).toHaveBeenCalledOnce();
    expect(value.revision).toHaveBeenCalledWith(
      'old',
      imported().opened,
      'replaceClean',
      'C:/synthetic/working.map',
    );
    expect(old.source!.sha256).toBe('a'.repeat(64));
    value.controller.dispose();
  });
  it('offers an explicit separate revision for saved authoring', async () => {
    const value = setup();
    value.get()[0].project.tagEdits.push({ tagId: 7, fieldKey: 'saved', value: 3 });
    await value.controller.poll();
    expect(value.bridge.import).not.toHaveBeenCalled();
    await value.controller.accept(report());
    expect(value.revision.mock.calls[0][2]).toBe('openSeparate');
    expect(value.get()[0].project.tagEdits).toHaveLength(1);
    value.controller.dispose();
  });
  it('downgrades an in-flight clean adoption when the user edits before import returns', async () => {
    const pending = deferred<ExternalRevision>(),
      value = setup({ import: vi.fn(() => pending.promise) });
    const poll = value.controller.poll();
    await vi.waitFor(() => expect(value.bridge.import).toHaveBeenCalledOnce());
    value.get()[0].dirty = true;
    pending.resolve(imported());
    await poll;
    expect(value.revision.mock.calls[0][2]).toBe('openSeparate');
    value.controller.dispose();
  });
  it('serializes poll batches and never applies a response after the map closed', async () => {
    const pending = deferred<ExternalWatchReport>(),
      value = setup({ poll: vi.fn(() => pending.promise) });
    const first = value.controller.poll();
    await vi.waitFor(() => expect(value.bridge.poll).toHaveBeenCalledOnce());
    await value.controller.poll();
    expect(value.bridge.poll).toHaveBeenCalledOnce();
    value.set([]);
    pending.resolve(report());
    await first;
    await value.controller.poll();
    expect(value.reports).not.toHaveBeenCalled();
    expect(value.bridge.import).not.toHaveBeenCalled();
    expect(value.bridge.stop).toHaveBeenCalledWith('watch');
    value.controller.dispose();
  });
  it('releases a monitor that finishes starting after unmount', async () => {
    const pending = deferred<ExternalWatchReport>(),
      value = setup({ start: vi.fn(() => pending.promise) });
    const first = value.controller.poll();
    value.controller.dispose();
    pending.resolve(report());
    await first;
    expect(value.bridge.stop).toHaveBeenCalledWith('watch');
    expect(value.revision).not.toHaveBeenCalled();
  });
  it('does not auto-adopt another cache/scenario or a deduplicated authored project', async () => {
    const mismatch = report();
    mismatch.candidate!.matchesSource = false;
    const value = setup({ poll: vi.fn(async () => mismatch) });
    await value.controller.poll();
    expect(value.bridge.import).not.toHaveBeenCalled();
    value.controller.dispose();
    const next = imported();
    next.opened.project.tagEdits.push({ tagId: 1, fieldKey: 'existing', value: 2 });
    next.deduplicated = true;
    const existing = setup({ import: vi.fn(async () => next) });
    await existing.controller.poll();
    expect(existing.revision.mock.calls[0][2]).toBe('openSeparate');
    existing.controller.dispose();
  });
  it('retains the old tab and reports a native revalidation failure', async () => {
    const value = setup({
      import: vi.fn(async () => {
        throw new Error('External map changed again');
      }),
    });
    await value.controller.poll();
    expect(value.revision).not.toHaveBeenCalled();
    expect(value.errors).toHaveBeenCalledWith('old', expect.stringContaining('changed again'));
    expect(value.get()[0].project.source!.sha256).toBe('a'.repeat(64));
    value.controller.dispose();
  });
  it('queues an explicit open behind the metadata poll instead of dropping the click', async () => {
    const pending = deferred<ExternalWatchReport>(),
      value = setup({ poll: vi.fn(() => pending.promise) });
    value.get()[0].dirty = true;
    const polling = value.controller.poll();
    await vi.waitFor(() => expect(value.bridge.poll).toHaveBeenCalledOnce());
    const opening = value.controller.accept(report());
    pending.resolve(report());
    await Promise.all([polling, opening]);
    expect(value.bridge.import).toHaveBeenCalledOnce();
    expect(value.revision.mock.calls[0][2]).toBe('openSeparate');
    value.controller.dispose();
  });
  it('restarts an expired native monitor and can explicitly request a metadata scan', async () => {
    const poll = vi
      .fn()
      .mockRejectedValueOnce(new Error('monitor closed'))
      .mockResolvedValue({ ...report(), status: 'watching', candidate: null });
    const value = setup({ poll });
    await value.controller.poll();
    await value.controller.poll(true);
    expect(value.bridge.start).toHaveBeenCalledTimes(2);
    expect(poll).toHaveBeenLastCalledWith('watch', true);
    expect(value.bridge.import).not.toHaveBeenCalled();
    value.controller.dispose();
  });
});
