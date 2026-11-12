import { RoiRect } from '../types/treman';

export interface ExtractedRoiFrames {
  roi_id: string;
  label: string;
  color: string;
  width: number;
  height: number;
  frameCount: number;
  grayBuffer: Uint8Array;
}

/**
 * Deterministically steps through the HTML5 <video> frame-by-frame at exact 1/fps
 * intervals using awaited 'seeked' events. Never drops frames regardless of CPU speed.
 */
export async function extractRoiGrayscaleFrames(
  video: HTMLVideoElement,
  rois: RoiRect[],
  fps: number,
  minRangeSec: number,
  maxRangeSec: number,
  percentageOfResolution: number,
  onProgress: (pct: number) => void,
  abortSignal: { aborted: boolean }
): Promise<ExtractedRoiFrames[]> {
  const scale = Math.max(0.1, Math.min(1.0, percentageOfResolution / 100));
  const decodedWidth = Math.max(2, Math.round(video.videoWidth * scale));
  const decodedHeight = Math.max(2, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = decodedWidth;
  canvas.height = decodedHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to initialize 2D canvas context for frame extraction.');
  }

  const dt = 1.0 / fps;
  // Match desktop FramesGrabber.cs: framesCount = Round((end - start) * fps)
  const totalFrames = Math.max(2, Math.round((maxRangeSec - minRangeSec) * fps));

  const scaledRois = rois.map((roi) => {
    const x = Math.max(0, Math.min(decodedWidth - 2, Math.round(roi.x * scale)));
    const y = Math.max(0, Math.min(decodedHeight - 2, Math.round(roi.y * scale)));
    const w = Math.max(2, Math.min(decodedWidth - x, Math.round(roi.width * scale)));
    const h = Math.max(2, Math.min(decodedHeight - y, Math.round(roi.height * scale)));
    return {
      roi,
      x,
      y,
      w,
      h,
      chunks: [] as Uint8Array[],
    };
  });

  const seekExact = (targetTime: number): Promise<void> =>
    new Promise((resolve) => {
      const safeMax = Math.max(0, (video.duration || targetTime) - 0.001);
      const clamped = Math.max(0, Math.min(safeMax, targetTime));
      if (Math.abs(video.currentTime - clamped) < 0.0001) {
        resolve();
        return;
      }
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = clamped;
    });

  video.pause();

  for (let i = 0; i < totalFrames; i++) {
    if (abortSignal.aborted) {
      throw new Error('Computation cancelled by user.');
    }

    // Add half-frame offset (+ 0.5 * dt) so browser decoder lands squarely inside frame i
    const targetTime = minRangeSec + (i + 0.5) * dt;
    if (targetTime > maxRangeSec) break;

    await seekExact(targetTime);
    ctx.drawImage(video, 0, 0, decodedWidth, decodedHeight);

    for (const item of scaledRois) {
      const imgData = ctx.getImageData(item.x, item.y, item.w, item.h).data;
      const pixelCount = item.w * item.h;
      const grayFrame = new Uint8Array(pixelCount);

      for (let p = 0, rgbaIdx = 0; p < pixelCount; p++, rgbaIdx += 4) {
        grayFrame[p] =
          (0.2989 * imgData[rgbaIdx] +
            0.587 * imgData[rgbaIdx + 1] +
            0.114 * imgData[rgbaIdx + 2]) |
          0;
      }
      item.chunks.push(grayFrame);
    }

    onProgress(Math.min(99, ((i + 1) / totalFrames) * 100));
  }

  return scaledRois.map((item) => {
    const nFrames = item.chunks.length;
    const frameSize = item.w * item.h;
    const flatBuffer = new Uint8Array(nFrames * frameSize);
    for (let f = 0; f < nFrames; f++) {
      flatBuffer.set(item.chunks[f], f * frameSize);
    }
    return {
      roi_id: item.roi.id,
      label: item.roi.label,
      color: item.roi.color,
      width: item.w,
      height: item.h,
      frameCount: nFrames,
      grayBuffer: flatBuffer,
    };
  });
}