// Native WebView encoder/decoder probe only. Does not bypass or test Spark's Save picker.
export async function probeEditorCapture(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.gs-director-stage canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw Error('Wait for the real Director canvas');
    const mime = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mime)) throw Error('Native VP8 recording unavailable');
    const stream = canvas.captureStream(24),
      chunks = [],
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
    const started = performance.now();
    window.__sparkQARecording = true;
    try {
      await new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () => reject(Error('Native encoder failed'));
        recorder.onstop = resolve;
        recorder.start(250);
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, 2200);
      });
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size || blob.size > 16 * 1024 * 1024) throw Error('Probe recording size is invalid');
      const video = document.createElement('video'),
        url = URL.createObjectURL(blob);
      video.muted = true;
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Native WebM decode timed out')), 10000);
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(Error('Native WebM decoder refused the recording'));
          };
          video.src = url;
          video.load();
        });
        const frame = document.createElement('canvas');
        frame.width = 64;
        frame.height = 36;
        const context = frame.getContext('2d');
        // loadeddata alone did not establish a presented GPU frame in WebView2.
        // Sample only after the decoder submits a frame, and retain its media time.
        const presented = () =>
          new Promise((resolve, reject) => {
            if (!video.requestVideoFrameCallback) {
              reject(Error('Video presentation callbacks unavailable'));
              return;
            }
            const timer = setTimeout(() => {
              video.cancelVideoFrameCallback(id);
              reject(Error('Native video presentation timed out'));
            }, 10000);
            const id = video.requestVideoFrameCallback((_, metadata) => {
              clearTimeout(timer);
              video.pause();
              resolve(metadata);
            });
            void video.play().catch((error) => {
              clearTimeout(timer);
              video.cancelVideoFrameCallback(id);
              reject(error);
            });
          });
        const firstPresented = await presented();
        context.drawImage(video, 0, 0, 64, 36);
        const pixels = context.getImageData(0, 0, 64, 36).data;
        let sum = 0,
          squared = 0,
          count = 0;
        for (let at = 0; at < pixels.length; at += 4) {
          const luma = (pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3;
          sum += luma;
          squared += luma * luma;
          count++;
        }
        const firstDeviation = Math.sqrt(squared / count - (sum / count) ** 2);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Native recorded-frame seek timed out')), 10000);
          video.onseeked = () => {
            clearTimeout(timer);
            resolve();
          };
          video.currentTime = 1;
        });
        const laterPresented = await presented();
        context.drawImage(video, 0, 0, 64, 36);
        const laterPixels = context.getImageData(0, 0, 64, 36).data;
        sum = 0;
        squared = 0;
        count = 0;
        for (let at = 0; at < laterPixels.length; at += 4) {
          const luma = (laterPixels[at] + laterPixels[at + 1] + laterPixels[at + 2]) / 3;
          sum += luma;
          squared += luma * luma;
          count++;
        }
        const deviation = Math.sqrt(squared / count - (sum / count) ** 2),
          frameImage = frame.toDataURL('image/png');
        const encoded = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return {
          encoded,
          frameImage,
          metadata: {
            scope: 'Native editor canvas encoder/decoder; not the application Save picker or game capture',
            mime,
            bytes: blob.size,
            width: video.videoWidth,
            height: video.videoHeight,
            requestedFps: 24,
            elapsedSeconds: (performance.now() - started) / 1000,
            audioTracks: stream.getAudioTracks().length,
            firstPresentedLumaDeviation: firstDeviation,
            firstPresentedMediaTime: firstPresented.mediaTime,
            laterPresentedMediaTime: laterPresented.mediaTime,
            decodedLumaDeviation: deviation,
            decoded: firstDeviation >= 2 && deviation >= 2,
          },
        };
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    } finally {
      window.__sparkQARecording = false;
      stream.getTracks().forEach((track) => track.stop());
    }
  });
}
