import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const ipc = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ native: true, call: ipc }));
import { recordDirector } from './directorRecording';
class Recorder {
  static current: Recorder;
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    Recorder.current = this;
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
  chunk(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}
const stream = {
  getAudioTracks: () => [],
  getVideoTracks: () => [{ getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }) }],
} as unknown as MediaStream;
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('MediaRecorder', Recorder);
  ipc.mockReset();
  ipc.mockImplementation(async (command: string) =>
    command === 'director_record_open'
      ? { id: 'owned', path: 'new.webm' }
      : command === 'director_record_finish'
        ? { id: 'owned', path: 'new.webm', bytes: 400000, sha256: 'verified' }
        : null,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test('a cancelled native picker never starts an encoder or sends chunks', async () => {
  ipc.mockResolvedValueOnce(null);
  const status = vi.fn();
  expect(await recordDirector('map', stream, 6000000, status)).toBeNull();
  expect(status).toHaveBeenCalledWith('idle', 'Recording cancelled.');
  expect(ipc).toHaveBeenCalledTimes(1);
});
test('slow native writes finish in sequence before publishing and paused time does not emit data', async () => {
  const order: number[] = [];
  let pending = 0,
    peak = 0;
  ipc.mockImplementation(async (command: string, args: any) => {
    if (command === 'director_record_open') return { id: 'owned', path: 'new.webm' };
    if (command === 'director_record_append') {
      peak = Math.max(peak, ++pending);
      await new Promise((resolve) => setTimeout(resolve, 2));
      order.push(args.sequence);
      pending--;
    }
    if (command === 'director_record_finish') {
      expect(pending).toBe(0);
      expect(args.failed).toBe(false);
      return { id: 'owned', path: 'new.webm', bytes: 400000, sha256: 'verified' };
    }
  });
  const status = vi.fn(),
    take = await recordDirector('map', stream, 6000000, status);
  Recorder.current.chunk(300000);
  Recorder.current.chunk(100000);
  take!.pause();
  expect(Recorder.current.state).toBe('paused');
  take!.resume();
  take!.stop();
  await take!.finished;
  expect(order).toEqual([0, 1, 2]);
  expect(peak).toBe(1);
  expect(status.mock.calls.at(-1)?.[1]).toContain('Saved new.webm');
});
test('a failed write never publishes a successful recording', async () => {
  ipc.mockImplementation(async (command: string, args: any) => {
    if (command === 'director_record_open') return { id: 'owned', path: 'partial.webm' };
    if (command === 'director_record_append') throw Error('disk full');
    if (command === 'director_record_finish') {
      expect(args.failed).toBe(true);
      throw Error('partial retained');
    }
  });
  const status = vi.fn(),
    take = await recordDirector('map', stream, 6000000, status);
  Recorder.current.chunk(300);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await take!.finished;
  expect(status.mock.calls.at(-1)?.[1]).toContain('partial retained');
  expect(status.mock.calls.some((call) => String(call[1]).startsWith('Saved '))).toBe(false);
});
test('an excessive pending buffer stops capture without sending an oversized native write', async () => {
  ipc.mockImplementation(async (command: string, args: any) => {
    if (command === 'director_record_open') return { id: 'owned', path: 'partial.webm' };
    if (command === 'director_record_finish') {
      expect(args.failed).toBe(true);
      throw Error('partial retained');
    }
  });
  const take = await recordDirector('map', stream, 6000000, () => {});
  Recorder.current.chunk(33 * 1024 * 1024);
  await take!.finished;
  expect(ipc.mock.calls.some((call) => call[0] === 'director_record_append')).toBe(false);
});
test('countdown cancellation closes the native reservation without starting an encoder', async () => {
  const controller = new AbortController(),
    take = recordDirector('map', stream, 6000000, () => {}, { countdown: 3, signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await expect(take).rejects.toThrow(/cancelled/);
  expect(ipc).toHaveBeenLastCalledWith('director_record_finish', { id: 'owned', failed: true });
  expect(Recorder.current.state).toBe('inactive');
});
test('named takes pass the visible destination and notify only after native publication', async () => {
  const saved = vi.fn(),
    take = await recordDirector('map', stream, 6000000, () => {}, {
      outputDirectory: 'D:/takes',
      fileName: 'scene-2.webm',
      onSaved: saved,
    });
  expect(ipc).toHaveBeenCalledWith('director_record_open', {
    projectId: 'map',
    outputDirectory: 'D:/takes',
    fileName: 'scene-2.webm',
  });
  expect(saved).not.toHaveBeenCalled();
  Recorder.current.chunk(100);
  take!.stop();
  await take!.finished;
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ path: 'new.webm', sha256: 'verified' }));
});
test('failed publication keeps the take name available for recovery and never reports saved', async () => {
  const saved = vi.fn();
  ipc.mockImplementation(async (command: string) => {
    if (command === 'director_record_open') return { id: 'owned', path: 'exists.webm' };
    if (command === 'director_record_finish') throw Error('existing file protected');
  });
  const status = vi.fn(),
    take = await recordDirector('map', stream, 6000000, status, { onSaved: saved });
  Recorder.current.chunk(100);
  take!.stop();
  await take!.finished;
  expect(saved).not.toHaveBeenCalled();
  expect(status.mock.calls.at(-1)?.[1]).toContain('existing file protected');
});
test('ended sources and already-cancelled requests never reserve an output', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    recordDirector('map', stream, 6000000, () => {}, { signal: controller.signal }),
  ).rejects.toThrow(/cancelled/);
  const ended = { getVideoTracks: () => [{ readyState: 'ended' }] } as unknown as MediaStream;
  await expect(recordDirector('map', ended, 6000000, () => {})).rejects.toThrow(/source has ended/);
  expect(ipc).not.toHaveBeenCalled();
});
test('a video source ending stops the take even when an audio track remains live', async () => {
  const video = Object.assign(new EventTarget(), {
    readyState: 'live',
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  });
  const source = {
    getVideoTracks: () => [video],
    getAudioTracks: () => [{ readyState: 'live' }],
  } as unknown as MediaStream;
  const take = await recordDirector('map', source, 6000000, () => {});
  Recorder.current.chunk(100);
  video.readyState = 'ended';
  video.dispatchEvent(new Event('ended'));
  await take!.finished;
  expect(Recorder.current.state).toBe('inactive');
  expect(ipc).toHaveBeenLastCalledWith('director_record_finish', { id: 'owned', failed: false });
});
