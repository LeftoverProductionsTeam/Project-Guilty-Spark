import { beforeEach, describe, expect, it, vi } from 'vitest';
const ipc = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ call: ipc }));
import { disconnectLiveSession } from './liveSession';
beforeEach(() => ipc.mockReset());
describe('live cleanup client contract', () => {
  it('pins cleanup to the captured connection identity and preserves the actual retirement message', async () => {
    const report = {
      outcome: 'retired',
      retiredTarget: 'mapChanged',
      detail: 'Old records retired; no replacement-session writes.',
    };
    ipc.mockResolvedValue(report);
    expect(await disconnectLiveSession('old-connection')).toEqual(report);
    expect(ipc).toHaveBeenCalledWith('live_mcc_disconnect', { expectedSession: 'old-connection' });
  });
  it('refuses to release a session without its observed identity', async () => {
    await expect(disconnectLiveSession()).rejects.toThrow(/session identity is missing/);
    expect(ipc).not.toHaveBeenCalled();
  });
  it('does not invent successful restoration for an old or malformed desktop reply', async () => {
    for (const reply of [null, {}, { outcome: 'unknown', detail: 'ok' }, { outcome: 'restored' }]) {
      ipc.mockResolvedValueOnce(reply);
      await expect(disconnectLiveSession('current')).rejects.toThrow(/did not confirm/);
    }
  });
  it('keeps a failed cleanup retryable and propagates a competing-window rejection', async () => {
    ipc.mockRejectedValueOnce(Error('Session changed in another window'));
    await expect(disconnectLiveSession('old')).rejects.toThrow(/Session changed/);
    ipc.mockResolvedValueOnce({ outcome: 'restored', retiredTarget: null, detail: 'Confirmed restoration.' });
    expect((await disconnectLiveSession('current')).outcome).toBe('restored');
  });
});
