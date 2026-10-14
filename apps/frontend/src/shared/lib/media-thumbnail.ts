// Small JPEG previews of private media (photo, GIF frame, video first frame) for grids and pickers.

const PREVIEW_MAX_SIDE = 480;

function createPreviewCanvas(width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function encodePreview(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode media preview'))),
      'image/jpeg',
      0.68
    );
  });
}

export async function createMediaThumbnail(blob: Blob, kind: 'image' | 'video', signal: AbortSignal): Promise<Blob> {
  if (kind === 'video') {
    const mediaUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Video preview timed out')), 15_000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(new DOMException('Preview cancelled', 'AbortError'));
        };
        video.addEventListener(
          'loadeddata',
          () => {
            cleanup();
            resolve();
          },
          { once: true }
        );
        video.addEventListener(
          'error',
          () => {
            cleanup();
            reject(new Error('Video preview is unavailable'));
          },
          { once: true }
        );
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }
        video.src = mediaUrl;
        video.load();
      });
      if (signal.aborted || video.videoWidth === 0 || video.videoHeight === 0)
        throw new DOMException('Preview cancelled', 'AbortError');
      const canvas = createPreviewCanvas(video.videoWidth, video.videoHeight);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return await encodePreview(canvas);
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(mediaUrl);
    }
  }

  const bitmap = await createImageBitmap(blob);
  try {
    if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError');
    const canvas = createPreviewCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await encodePreview(canvas);
  } finally {
    bitmap.close();
  }
}
