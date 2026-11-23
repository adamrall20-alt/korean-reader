import type { ReaderLanguage } from '@/types/language';
import { browser } from 'wxt/browser';
import type { SubtitleToken, TokenizedSubtitleLine, TokenizeMessage, TokenizeResponse } from '@/types/messages';

/** Most recently used lines kept in memory per tab (overlay, sidebar and rewinds share it). */
export const TOKENIZE_CACHE_LIMIT = 500;
/** Upper bound on lines sent to the background in one `tokenize` message. */
export const TOKENIZE_BATCH_LIMIT = 50;

interface PendingLine {
  resolve: (line: TokenizedSubtitleLine) => void;
  reject: (error: unknown) => void;
}

// Cached lines are stored with line index 0 in their token IDs and re-indexed when returned.
const cache = new Map<string, TokenizedSubtitleLine>();
const inFlight = new Map<string, Promise<TokenizedSubtitleLine>>();
const queued = { ko: new Map<string, PendingLine[]>(), ja: new Map<string, PendingLine[]>() };
const cacheKey = (text: string, language: ReaderLanguage) => language + ':' + text;
let flushScheduled = false;

function remember(text: string, line: TokenizedSubtitleLine): void {
  cache.delete(text);
  cache.set(text, line);
  if (cache.size > TOKENIZE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function cached(text: string): TokenizedSubtitleLine | undefined {
  const line = cache.get(text);
  if (line) remember(text, line);
  return line;
}

function reindexToken(token: SubtitleToken, prefix: string): SubtitleToken {
  return {
    ...token,
    id: token.id.replace(/^\d+:/u, prefix),
    ...(token.parts ? { parts: token.parts.map((part) => reindexToken(part, prefix)) } : {}),
  };
}

function withLineIndex(line: TokenizedSubtitleLine, lineIndex: number): TokenizedSubtitleLine {
  const prefix = `${lineIndex}:`;
  return {
    ...line,
    tokens: line.tokens.map((token) => reindexToken(token, prefix)),
  };
}

async function sendBatch(batch: Map<string, PendingLine[]>, language: ReaderLanguage): Promise<void> {
  const lines = [...batch.keys()];
  const settle = (error: unknown) => {
    for (const waiters of batch.values()) for (const waiter of waiters) waiter.reject(error);
  };
  try {
    const response: TokenizeResponse | undefined = await browser.runtime.sendMessage({
      type: 'tokenize', lines, ...(language === 'ja' ? { language } : {}),
    } satisfies TokenizeMessage);
    if (!response?.ok || response.lines?.length !== lines.length) {
      throw new Error(response?.error ?? (language === 'ja' ? 'Japanese analysis failed.' : 'Korean analysis failed.'));
    }
    response.lines.forEach((result, index) => {
      const text = lines[index]!;
      const normalised = withLineIndex(result, 0);
      remember(cacheKey(text, language), normalised);
      for (const waiter of batch.get(text)!) waiter.resolve(normalised);
    });
  } catch (error) {
    settle(error);
  }
}

function flush(): void {
  flushScheduled = false;
  for (const language of ['ko', 'ja'] as const) {
    let batch = new Map<string, PendingLine[]>();
    let length = 0;
    for (const [text, waiters] of queued[language]) {
      if (batch.size === TOKENIZE_BATCH_LIMIT || (language === 'ja' && length + text.length > 12_000 && batch.size)) {
        void sendBatch(batch, language);
        batch = new Map();
        length = 0;
      }
      batch.set(text, waiters);
      length += text.length;
    }
    queued[language].clear();
    if (batch.size) void sendBatch(batch, language);
  }
}

function request(text: string, language: ReaderLanguage): Promise<TokenizedSubtitleLine> {
  const key = cacheKey(text, language);
  const hit = cached(key);
  if (hit) return Promise.resolve(hit);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = new Promise<TokenizedSubtitleLine>((resolve, reject) => {
    const waiters = queued[language].get(text) ?? [];
    waiters.push({ resolve, reject });
    queued[language].set(text, waiters);
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  // Requests made in the same task (e.g. one IntersectionObserver callback) share one message.
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
  return promise;
}

/** Returns a previously tokenized line from the per-tab cache without messaging the background. */
export function getCachedTokenizedLine(text: string, language: ReaderLanguage = 'ko'): TokenizedSubtitleLine | undefined {
  return cached(cacheKey(text, language));
}

/**
 * Tokenizes subtitle lines through the background Kiwi worker, reusing recently analysed lines
 * and combining concurrent requests into a single `tokenize` message.
 * Token IDs use each line's position in `lines`, matching a direct background request.
 */
async function requestLine(text: string, language: ReaderLanguage): Promise<TokenizedSubtitleLine> {
  if (language !== 'ja' || text.length <= 2_000) return request(text, language);
  const chunks: { text: string; start: number }[] = [];
  for (let start = 0; start < text.length;) {
    const candidate = text.slice(start, start + 1_600);
    const punctuation = [...candidate.matchAll(/[。！？!?\s]/gu)].at(-1)?.index ?? -1;
    let end = candidate.length;
    if (start + end < text.length) {
      if (punctuation >= 800) end = punctuation + 1;
      else if (/[\uD800-\uDBFF]/u.test(candidate.at(-1) ?? '')) end -= 1;
    }
    chunks.push({ text: candidate.slice(0, end), start });
    start += end;
  }
  const parsed = await Promise.all(chunks.map((chunk) => request(chunk.text, language)));
  const tokens = parsed.flatMap((line, index) => line.tokens.map((token) => {
    const start = chunks[index]!.start + token.start;
    return { ...token, start, id: '0:' + start };
  }));
  return { text, tokens };
}

export async function tokenizeLines(lines: readonly string[], language: ReaderLanguage = 'ko'): Promise<TokenizedSubtitleLine[]> {
  if (!lines.length) return [];
  const results = await Promise.all(lines.map((text) => requestLine(text, language)));
  return results.map((line, index) => withLineIndex(line, index));
}

/** Clears the per-tab cache. Intended for tests. */
export function clearTokenizeCache(): void {
  cache.clear();
}
