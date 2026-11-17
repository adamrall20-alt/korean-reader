/** Snapshot the video pixels, excluding page controls and subtitle overlays. */
export function captureVideoFrame(video: HTMLVideoElement | null): string | undefined {
  if (!video || !video.videoWidth || !video.videoHeight) return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    // Browsers can block access to protected or cross-origin video pixels.
    return undefined;
  }
}
