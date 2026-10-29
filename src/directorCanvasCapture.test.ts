import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { directorCanvasCapture } from './directorCanvasCapture';
let callbacks: Map<number, FrameRequestCallback>, next: number, canvas: any, context: any, track: any;
beforeEach(() => {
  callbacks = new Map();
  next = 0;
  context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  track = { stop: vi.fn(), requestFrame: vi.fn() };
  canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    captureStream: vi.fn(() => ({ getTracks: () => [track], getVideoTracks: () => [track] })),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
function frame(time: number) {
  const batch = [...callbacks.values()];
  callbacks.clear();
  batch.forEach((callback) => callback(time));
}
test('preview resizing keeps the export dimensions and fits new frames without stretching', async () => {
  const source = { width: 1280, height: 720 } as HTMLCanvasElement,
    capture = directorCanvasCapture(source, 24),
    ready = capture.start();
  frame(0);
  frame(16);
  await ready;
  source.width = 800;
  source.height = 800;
  frame(80);
  expect([canvas.width, canvas.height]).toEqual([1280, 720]);
  expect(context.drawImage).toHaveBeenLastCalledWith(source, 280, 0, 720, 720);
  capture.dispose();
  expect(track.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
test('preparation cancellation stops owned tracks and cancels future frame work', async () => {
  const capture = directorCanvasCapture({ width: 1280, height: 720 } as HTMLCanvasElement, 30),
    controller = new AbortController(),
    ready = capture.start(controller.signal);
  controller.abort();
  await expect(ready).rejects.toThrow(/cancelled/);
  expect(track.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
  capture.dispose();
  expect(track.stop).toHaveBeenCalledOnce();
});
test('invalid or excessive render targets fail before creating an export stream', () => {
  for (const [width, height, fps] of [
    [0, 720, 30],
    [8193, 2, 30],
    [8192, 8192, 30],
    [1280, 720, 0],
  ])
    expect(() => directorCanvasCapture({ width, height } as HTMLCanvasElement, fps)).toThrow();
  expect(canvas.captureStream).not.toHaveBeenCalled();
});
test('a failed source draw releases the buffer instead of leaving an active frame loop', async () => {
  const source = { width: 1280, height: 720 } as HTMLCanvasElement,
    capture = directorCanvasCapture(source, 60),
    ready = capture.start();
  source.width = 0;
  frame(0);
  await expect(ready).rejects.toThrow(/no longer available/);
  expect(track.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
test('24 fps sampling carries fractional frame time instead of falling to 20 on a 60 Hz display', async () => {
  const capture = directorCanvasCapture({ width: 1280, height: 720 } as HTMLCanvasElement, 24),
    ready = capture.start();
  frame(0);
  frame(1000 / 60);
  await ready;
  const before = context.drawImage.mock.calls.length;
  for (let n = 2; n <= 61; n++) frame((n * 1000) / 60);
  expect(context.drawImage.mock.calls.length - before).toBeGreaterThanOrEqual(23);
  expect(context.drawImage.mock.calls.length - before).toBeLessThanOrEqual(25);
  expect(track.requestFrame.mock.calls.length).toBe(context.drawImage.mock.calls.length - 1);
  capture.dispose();
});
