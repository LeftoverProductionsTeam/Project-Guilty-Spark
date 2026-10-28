import { aspectRatio } from './machinima';
import type { MachinimaSettings } from './machinima';
export function cropFrame(width: number, height: number, ratio: number) {
  const w = Math.min(width, height * ratio),
    h = w / ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
export function downloadMedia(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function frameCanvas(source: HTMLCanvasElement, aspect: MachinimaSettings['aspect']) {
  if (!source.width || !source.height) throw new Error('Wait for the viewport to render.');
  const crop = cropFrame(source.width, source.height, aspectRatio(aspect)),
    scale = Math.min(1, 1920 / crop.width, 1080 / crop.height),
    canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.floor((crop.width * scale) / 2) * 2);
  canvas.height = Math.max(2, Math.floor((crop.height * scale) / 2) * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Frame capture is unavailable.');
  const draw = () =>
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  draw();
  return { canvas, draw };
}
export async function captureFrame(source: HTMLCanvasElement, aspect: MachinimaSettings['aspect']) {
  const { canvas } = frameCanvas(source, aspect),
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('The rendered frame could not be captured.'))),
        'image/png',
      ),
    );
  downloadMedia('spark-frame-' + Date.now() + '.png', blob);
  return { width: canvas.width, height: canvas.height };
}
/** Records only this owned editor canvas; no desktop, microphone or game capture. */
export function recordViewport(
  source: HTMLCanvasElement,
  settings: MachinimaSettings,
  onState: (active: boolean, detail: string) => void,
): () => void {
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
    (value) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value),
  );
  if (!mime)
    throw new Error('WebM recording is unavailable in this browser. PNG frame capture is still available.');
  const { canvas, draw } = frameCanvas(source, settings.aspect),
    stream = canvas.captureStream(settings.fps),
    chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
  let raf = 0,
    total = 0,
    failed = false,
    done = false;
  const started = performance.now();
  const beforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };
  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const cleanup = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    window.removeEventListener('beforeunload', beforeUnload);
  };
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      chunks.push(e.data);
      total += e.data.size;
      if (total > 128 * 1024 * 1024) {
        failed = true;
        stop();
      }
    }
  };
  recorder.onerror = () => {
    failed = true;
    stop();
    cleanup();
    onState(false, 'Recording failed; use PNG capture or try another browser.');
  };
  recorder.onstop = () => {
    if (done) return;
    done = true;
    cleanup();
    if (!failed && chunks.length) {
      downloadMedia('spark-viewport-' + Date.now() + '.webm', new Blob(chunks, { type: mime }));
      onState(false, 'Silent viewport clip exported.');
    } else onState(false, 'Recording exceeded its limit or returned no frames.');
  };
  const loop = () => {
    if (recorder.state !== 'recording') return;
    try {
      draw();
    } catch {
      failed = true;
      stop();
      return;
    }
    if (performance.now() - started >= 120000) {
      stop();
      return;
    }
    raf = requestAnimationFrame(loop);
  };
  try {
    recorder.start(1000);
    window.addEventListener('beforeunload', beforeUnload);
    raf = requestAnimationFrame(loop);
    onState(
      true,
      `Recording ${canvas.width} × ${canvas.height} at ${settings.fps} fps · silent · 120 s maximum`,
    );
  } catch (error) {
    cleanup();
    throw error;
  }
  return stop;
}
