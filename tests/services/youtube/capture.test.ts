import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureVideoFrame } from '@/services/youtube/capture';

describe('video frame capture', () => {
  afterEach(() => vi.restoreAllMocks());

  it('captures only video pixels at the original dimensions', () => {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 640 }, videoHeight: { value: 360 } });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YWJj');
    expect(captureVideoFrame(video)).toBe('data:image/jpeg;base64,YWJj');
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0);
  });

  it('handles missing video and blocked pixel access', () => {
    expect(captureVideoFrame(null)).toBeUndefined();
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 640 }, videoHeight: { value: 360 } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => { throw new Error('blocked'); });
    expect(captureVideoFrame(video)).toBeUndefined();
  });
});
