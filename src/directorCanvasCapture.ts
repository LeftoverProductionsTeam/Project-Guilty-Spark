/** One bounded 2D export surface; the existing scene remains the rendering source. */
export interface DirectorCanvasCapture {
  stream: MediaStream;
  start: (signal?: AbortSignal) => Promise<void>;
  dispose: () => void;
}
export function directorCanvasCapture(source: HTMLCanvasElement, fps: number): DirectorCanvasCapture {
  const width = source.width,
    height = source.height;
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_777_216 ||
    ![24, 30, 60].includes(fps)
  )
    throw Error('Choose a rendered view up to 8192 pixels per side / 16 megapixels and 24, 30 or 60 fps.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw Error('The recording frame buffer is unavailable.');
  let requestFrame = () => {};
  const draw = () => {
    if (!source.width || !source.height) throw Error('The map view is no longer available.');
    const scale = Math.min(width / source.width, height / source.height),
      w = source.width * scale,
      h = source.height * scale;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    requestFrame();
  };
  draw();
  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  requestFrame = () => track?.requestFrame?.();
  let disposed = false,
    raf = 0,
    starting = false,
    cancelReady: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    cancelReady?.();
    stream.getTracks().forEach((track) => track.stop());
  };
  const start = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (disposed || starting) {
        reject(Error('The recording frame buffer is no longer available.'));
        return;
      }
      starting = true;
      let frames = 0,
        last = Number.NEGATIVE_INFINITY,
        ready = false;
      const finish = (error?: Error) => {
        if (ready) return;
        ready = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        cancelReady = undefined;
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        finish(Error('Recording cancelled.'));
        dispose();
      };
      const timer = setTimeout(() => {
        finish(Error('The map did not present a recording frame. Restore the Director and try again.'));
        dispose();
      }, 10000);
      cancelReady = () => finish(Error('Recording cancelled.'));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      const tick = (now: number) => {
        if (disposed) return;
        try {
          if (frames < 2 || now - last >= 1000 / fps) {
            draw();
            last = frames < 2 ? now : now - ((now - last) % (1000 / fps));
            frames++;
          }
          if (frames >= 2) finish();
        } catch (error) {
          finish(error instanceof Error ? error : Error(String(error)));
          dispose();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  return { stream, start, dispose };
}
