import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSCRIPT_REQUEST, TRANSCRIPT_RESPONSE, type TranscriptCue } from '@/services/youtube/transcript';

const videoId = 'abcdefghijk';
const context = { client: { hl: 'en', gl: 'AU' } };
const fetchMock = vi.fn<typeof fetch>();

function setWatchData(watchData: unknown, tracks: unknown[] = []) {
  Object.assign(window, {
    ytInitialData: watchData,
    ytInitialPlayerResponse: {
      videoDetails: { videoId },
      captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
    },
    ytcfg: { get: () => context },
  });
}

function requestTranscript(): Promise<TranscriptCue[]> {
  return new Promise((resolve) => {
    document.addEventListener(TRANSCRIPT_RESPONSE, (event) => {
      resolve((event as CustomEvent<{ cues: TranscriptCue[] }>).detail.cues);
    }, { once: true });
    document.dispatchEvent(new CustomEvent(TRANSCRIPT_REQUEST, { detail: { videoId, requestId: 1 } }));
  });
}

describe('YouTube transcript language selection', () => {
  beforeAll(async () => {
    vi.stubGlobal('defineContentScript', (entry: { main: () => void }) => entry.main());
    await import('@/entrypoints/transcript-main.content');
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=' + videoId));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('asks the modern panel for Korean and rejects an English response with a Korean name', async () => {
    setWatchData({ tag: 'PAmodern_transcript_view' });
    fetchMock.mockResolvedValueOnce(Response.json({
      transcriptSegmentViewModel: { timestamp: '0:00', simpleText: 'Welcome to school. My name is 민지.' },
    }));

    expect(await requestTranscript()).toEqual([]);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/youtubei/v1/get_panel');
    expect(JSON.parse(request?.body as string).context.client).toEqual({ hl: 'ko', gl: 'AU' });
    expect(context.client.hl).toBe('en');
  });

  it('loads a Korean language option when the legacy transcript defaults to English', async () => {
    setWatchData({ getTranscriptEndpoint: { params: 'default' } });
    const segment = (text: string) => ({
      transcriptSegmentRenderer: {
        startMs: '2000', endMs: '5000', snippet: { runs: [{ text }] },
      },
    });
    fetchMock.mockResolvedValueOnce(Response.json({
      ...segment('Hello from 민지.'),
      languageMenu: [{ subMenuItemRenderer: {
        title: 'Korean (auto-generated)',
        continuation: { reloadContinuationData: { continuation: 'korean' } },
      } }],
    })).mockResolvedValueOnce(Response.json(segment('안녕하세요. 반갑습니다.')));

    expect(await requestTranscript()).toEqual([{ start: 2, end: 5, text: '안녕하세요. 반갑습니다.' }]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]?.body as string).params).toBe('korean');
  });

  it('tries another Korean caption track when the preferred track is unavailable', async () => {
    setWatchData({}, [
      { languageCode: 'en', baseUrl: '/api/timedtext?lang=en' },
      { languageCode: 'ko', kind: 'asr', baseUrl: '/api/timedtext?lang=ko&kind=asr' },
      { languageCode: 'ko', baseUrl: '/api/timedtext?lang=ko' },
    ]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '안녕하세요.' }] }] }));

    expect(await requestTranscript()).toEqual([{ start: 0, end: 1, text: '안녕하세요.' }]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://www.youtube.com/api/timedtext?lang=ko&fmt=json3',
      'https://www.youtube.com/api/timedtext?lang=ko&kind=asr&fmt=json3',
    ]);
  });
});
