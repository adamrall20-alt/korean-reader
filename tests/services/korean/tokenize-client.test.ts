import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearTokenizeCache,
  getCachedTokenizedLine,
  TOKENIZE_BATCH_LIMIT,
  TOKENIZE_CACHE_LIMIT,
  tokenizeLines,
} from '@/services/korean/tokenize-client';
import type { TokenizedSubtitleLine, TokenizeMessage } from '@/types/messages';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));

function makeLine(text: string, lineIndex = 0): TokenizedSubtitleLine {
  return {
    text,
    tokens: [
      {
        id: `${lineIndex}:0`,
        text,
        start: 0,
        length: text.length,
        clickable: true,
        morphemes: [{ text, tag: 'NNG', position: 0, length: text.length }],
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('shared tokenization client', () => {
  afterEach(() => {
    clearTokenizeCache();
    sendMessage.mockReset();
  });

  it('returns an empty list immediately without sending a message', async () => {
    await expect(tokenizeLines([])).resolves.toEqual([]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('batches concurrent requests, deduplicates lines, and re-indexes token IDs', async () => {
    sendMessage.mockImplementation(async (message: TokenizeMessage) => ({
      ok: true,
      lines: message.lines.map((line, index) => makeLine(line, index)),
    }));

    const [singleA, pair, singleB] = await Promise.all([
      tokenizeLines(['안녕하세요']),
      tokenizeLines(['반갑습니다', '안녕하세요']),
      tokenizeLines(['반갑습니다']),
    ]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'tokenize',
      lines: ['안녕하세요', '반갑습니다'],
    });
    expect(singleA[0]!.tokens[0]!.id).toBe('0:0');
    expect(pair[0]!.tokens[0]!.id).toBe('0:0');
    expect(pair[1]!.tokens[0]!.id).toBe('1:0');
    expect(singleB[0]!.tokens[0]!.id).toBe('0:0');
  });

  it('reuses cached lines on rewinds and sends only uncached lines', async () => {
    sendMessage.mockImplementation(async (message: TokenizeMessage) => ({
      ok: true,
      lines: message.lines.map((line, index) => makeLine(line, index)),
    }));

    await tokenizeLines(['첫 번째', '두 번째']);
    expect(getCachedTokenizedLine('첫 번째')?.text).toBe('첫 번째');
    expect(getCachedTokenizedLine('없는 문장')).toBeUndefined();

    const rewound = await tokenizeLines(['두 번째', '세 번째', '첫 번째']);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'tokenize',
      lines: ['세 번째'],
    });
    expect(rewound.map((line) => line.tokens[0]!.id)).toEqual(['0:0', '1:0', '2:0']);
  });

  it('shares an in-flight request before the background finishes', async () => {
    const pending = deferred<{ ok: true; lines: TokenizedSubtitleLine[] }>();
    sendMessage.mockReturnValueOnce(pending.promise);

    const first = tokenizeLines(['진행 중']);
    await Promise.resolve();
    const second = tokenizeLines(['진행 중']);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: true, lines: [makeLine('진행 중')] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      [makeLine('진행 중', 0)],
      [makeLine('진행 중', 0)],
    ]);
  });

  it('splits large flushes at the batch limit', async () => {
    sendMessage.mockImplementation(async (message: TokenizeMessage) => ({
      ok: true,
      lines: message.lines.map((line, index) => makeLine(line, index)),
    }));

    const total = TOKENIZE_BATCH_LIMIT + 7;
    const lines = Array.from({ length: total }, (_, index) => `문장 ${index}`);
    const results = await tokenizeLines(lines);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect((sendMessage.mock.calls[0]![0] as TokenizeMessage).lines).toHaveLength(TOKENIZE_BATCH_LIMIT);
    expect((sendMessage.mock.calls[1]![0] as TokenizeMessage).lines).toHaveLength(7);
    expect(results).toHaveLength(total);
    expect(results[total - 1]!.tokens[0]!.id).toBe(`${total - 1}:0`);
  });

  it('evicts the least-recently-used lines past the cache limit', async () => {
    sendMessage.mockImplementation(async (message: TokenizeMessage) => ({
      ok: true,
      lines: message.lines.map((line, index) => makeLine(line, index)),
    }));

    const initial = Array.from({ length: TOKENIZE_CACHE_LIMIT }, (_, index) => `행 ${index}`);
    await tokenizeLines(initial);
    // Refresh recency of '행 0' so '행 1' becomes the oldest entry.
    expect(getCachedTokenizedLine('행 0')?.text).toBe('행 0');

    await tokenizeLines(['새 행']);
    expect(getCachedTokenizedLine('행 0')?.text).toBe('행 0');
    expect(getCachedTokenizedLine('행 1')).toBeUndefined();
  });

  it('does not cache failures and allows subsequent retries to succeed', async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: false, error: 'Kiwi unavailable' })
      .mockResolvedValueOnce({ ok: true, lines: [] })
      .mockRejectedValueOnce(new Error('Disconnected'))
      .mockResolvedValueOnce({ ok: true, lines: [makeLine('다시 시도')] });

    await expect(tokenizeLines(['다시 시도'])).rejects.toThrow('Kiwi unavailable');
    expect(getCachedTokenizedLine('다시 시도')).toBeUndefined();

    await expect(tokenizeLines(['다시 시도'])).rejects.toThrow('Korean analysis failed.');
    await expect(tokenizeLines(['다시 시도'])).rejects.toThrow('Disconnected');
    await expect(tokenizeLines(['다시 시도'])).resolves.toEqual([makeLine('다시 시도', 0)]);
    expect(getCachedTokenizedLine('다시 시도')?.text).toBe('다시 시도');
  });
});
