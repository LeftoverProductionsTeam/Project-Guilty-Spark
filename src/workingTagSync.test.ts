import { describe, it, expect, vi } from 'vitest';
import { WorkingTagSync, type WorkingTagReport } from './workingTagSync';
const report = (patch: Partial<WorkingTagReport> = {}): WorkingTagReport => ({
  watchId: 'watch',
  projectId: 'map',
  buildId: 'build',
  tagsDirectory: 'owned/tags',
  status: 'unchanged',
  basis: 'compiledBuild',
  revision: 0,
  totalFiles: 2,
  changedFiles: 0,
  changes: [],
  listTruncated: false,
  hashesReadLastScan: 0,
  ...patch,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};
function fixture() {
  const api = {
    start: vi.fn(async () => report()),
    poll: vi.fn(async (_id: string, _force: boolean) => report()),
    stop: vi.fn(async (_id: string) => {}),
  };
  const accept = vi.fn(),
    error = vi.fn();
  return { api, accept, error, watch: new WorkingTagSync('map', 'build', api, accept, error) };
}
describe('working tool tag synchronization', () => {
  it('reports stable native changes and releases its window watch', async () => {
    const f = fixture();
    await f.watch.poll();
    f.api.poll.mockResolvedValue(
      report({
        status: 'changed',
        changedFiles: 1,
        changes: [{ kind: 'modified', path: 'weapons/pistol.weapon' }],
      }),
    );
    await f.watch.poll();
    expect(f.accept.mock.lastCall?.[0].changedFiles).toBe(1);
    f.watch.dispose();
    expect(f.api.stop).toHaveBeenCalledWith('watch');
  });
  it('serializes requests and queues an explicit scan instead of overlapping native reads', async () => {
    const f = fixture(),
      pending = deferred<WorkingTagReport>();
    f.api.start.mockReturnValue(pending.promise);
    const first = f.watch.poll();
    void f.watch.poll();
    void f.watch.poll(true);
    expect(f.api.start).toHaveBeenCalledTimes(1);
    pending.resolve(report());
    await first;
    await Promise.resolve();
    expect(f.api.poll).toHaveBeenCalledTimes(1);
    expect(f.api.poll).toHaveBeenCalledWith('watch', true);
    f.watch.dispose();
  });
  it('never adopts a late start after a map closes', async () => {
    const f = fixture(),
      pending = deferred<WorkingTagReport>();
    f.api.start.mockReturnValue(pending.promise);
    const started = f.watch.poll();
    f.watch.dispose();
    pending.resolve(report());
    await started;
    expect(f.accept).not.toHaveBeenCalled();
    expect(f.api.stop).toHaveBeenCalledTimes(1);
  });
  it('ignores an in-flight poll on disposal and stops the watch only once', async () => {
    const f = fixture();
    await f.watch.poll();
    f.accept.mockClear();
    const pending = deferred<WorkingTagReport>();
    f.api.poll.mockReturnValue(pending.promise);
    const polled = f.watch.poll();
    f.watch.dispose();
    pending.resolve(report({ changedFiles: 99 }));
    await polled;
    expect(f.accept).not.toHaveBeenCalled();
    expect(f.api.stop).toHaveBeenCalledTimes(1);
  });
  it('rejects another map/build result without displaying its changes', async () => {
    const f = fixture();
    f.api.start.mockResolvedValue(report({ buildId: 'other' }));
    await f.watch.poll();
    expect(f.accept).not.toHaveBeenCalled();
    expect(f.error.mock.lastCall?.[0]).toMatch(/different map build/);
    expect(f.api.stop).toHaveBeenCalledWith('watch');
  });
  it('keeps the baseline through transient read errors and retries the same watch', async () => {
    const f = fixture();
    await f.watch.poll();
    f.api.poll.mockRejectedValueOnce(Error('Sharing violation during save'));
    await f.watch.poll();
    expect(f.error.mock.lastCall?.[0]).toContain('Sharing violation');
    await f.watch.poll();
    expect(f.api.start).toHaveBeenCalledTimes(1);
    expect(f.api.stop).not.toHaveBeenCalled();
    expect(f.error.mock.lastCall?.[0]).toBe('');
    f.watch.dispose();
  });
  it('reconnects an expired native watch rather than accepting a stale report', async () => {
    const f = fixture();
    await f.watch.poll();
    f.api.poll.mockRejectedValueOnce(Error('Working tag watch expired; reconnect it'));
    await f.watch.poll();
    await f.watch.poll();
    expect(f.api.start).toHaveBeenCalledTimes(2);
    expect(f.api.stop).toHaveBeenCalledTimes(1);
    f.watch.dispose();
  });
});
