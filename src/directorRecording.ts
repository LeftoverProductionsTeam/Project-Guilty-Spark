import { call, native } from './api';
export interface RecordingReceipt {
  id: string;
  path: string;
  bytes: number;
  sha256: string | null;
}
export interface ActiveRecording {
  recorder: MediaRecorder;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  finished: Promise<void>;
}
interface RecordingOptions {
  countdown?: number;
  signal?: AbortSignal;
}

/** Canvas or OS-permissioned display stream only. Ordered writes bound queued memory. */
export async function recordDirector(
  projectId: string,
  stream: MediaStream,
  quality: number,
  onState: (state: string, detail: string) => void,
  options: RecordingOptions = {},
): Promise<ActiveRecording | null> {
  if (!native) throw new Error('Save recording is available in the desktop Director.');
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'].find(
    (mime) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
  );
  if (!mime) throw new Error('WebM recording is not supported here; OBS can capture this window.');
  const file = await call<RecordingReceipt | null>('director_record_open', { projectId });
  if (!file) {
    onState('idle', 'Recording cancelled.');
    return null;
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality });
    for (let seconds = options.countdown ?? 0; seconds > 0; seconds--) {
      if (options.signal?.aborted) throw new Error('Recording countdown cancelled.');
      onState('preparing', `Recording in ${seconds}…`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error('Recording countdown cancelled.'));
        };
        const timer = setTimeout(() => {
          options.signal?.removeEventListener('abort', abort);
          resolve();
        }, 1000);
        options.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (options.signal?.aborted) throw new Error('Recording cancelled.');
  } catch (reason) {
    await call('director_record_finish', { id: file.id, failed: true }).catch(() => {});
    throw reason;
  }
  let sequence = 0,
    pending = 0,
    failed = false,
    queue = Promise.resolve();
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const unload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', unload);
  recorder.ondataavailable = (event) => {
    if (!event.data.size || failed) return;
    pending += event.data.size;
    if (pending > 32 * 1024 * 1024) {
      failed = true;
      stop();
      onState('saving', 'Storage fell behind capture. Partial recording retained.');
      return;
    }
    queue = queue
      .then(async () => {
        if (failed) return;
        const bytes = new Uint8Array(await event.data.arrayBuffer());
        for (let at = 0; at < bytes.length; at += 256 * 1024) {
          if (failed) return;
          await call('director_record_append', {
            id: file.id,
            sequence: sequence++,
            bytes: Array.from(bytes.subarray(at, at + 256 * 1024)),
          });
        }
      })
      .catch((reason) => {
        failed = true;
        stop();
        onState('saving', String(reason));
      })
      .finally(() => {
        pending -= event.data.size;
      });
  };
  recorder.onerror = () => {
    failed = true;
    stop();
  };
  recorder.onstop = () => {
    onState('saving', 'Saving recording…');
    void queue
      .then(() => call<RecordingReceipt>('director_record_finish', { id: file.id, failed }))
      .then((receipt) =>
        onState(
          'idle',
          `Saved ${receipt.path} · ${(receipt.bytes / 1048576).toFixed(1)} MiB · SHA-256 ${receipt.sha256}`,
        ),
      )
      .catch((reason) => onState('idle', String(reason)))
      .finally(() => {
        window.removeEventListener('beforeunload', unload);
        finish();
      });
  };
  try {
    recorder.start(500);
    const track = stream.getVideoTracks()[0]?.getSettings();
    onState(
      'recording',
      `Recording to ${file.path} · ${track?.width ?? '?'}×${track?.height ?? '?'} at ${track?.frameRate?.toFixed(1) ?? '?'} fps · ${stream.getAudioTracks().length ? 'shared audio included' : 'video only — no game audio track'}`,
    );
  } catch (reason) {
    window.removeEventListener('beforeunload', unload);
    await call('director_record_finish', { id: file.id, failed: true }).catch(() => {});
    finish();
    throw reason;
  }
  return {
    recorder,
    stop,
    finished,
    pause: () => {
      if (recorder.state === 'recording') {
        recorder.pause();
        onState('paused', 'Recording paused.');
      }
    },
    resume: () => {
      if (recorder.state === 'paused') {
        recorder.resume();
        onState('recording', 'Recording resumed.');
      }
    },
  };
}
