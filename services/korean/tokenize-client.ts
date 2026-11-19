import { browser } from 'wxt/browser';
import type { TokenizedSubtitleLine, TokenizeMessage, TokenizeResponse } from '@/types/messages';

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
let queued = new Map<string, PendingLine[]>();
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

function withLineIndex(line: TokenizedSubtitleLine, lineIndex: number): TokenizedSubtitleLine {
  const prefix = `${lineIndex}:`;
  return {
    ...line,
    tokens: line.tokens.map((token) => ({ ...token, id: token.id.replace(/^\d+:/u, prefix) })),
  };
}

async function sendBatch(batch: Map<string, PendingLine[]>): Promise<void> {
  const lines = [...batch.keys()];
  const settle = (error: unknown) => {
    for (const waiters of batch.values()) for (const waiter of waiters) waiter.reject(error);
  };
  try {
    const response: TokenizeResponse | undefined = await browser.runtime.sendMessage({
      type: 'tokenize', lines,
    } satisfies TokenizeMessage);
    if (!response?.ok || response.lines?.length !== lines.length) {
      throw new Error(response?.error ?? 'Korean analysis failed.');
    }
    response.lines.forEach((result, index) => {
      const text = lines[index]!;
      const normalised = withLineIndex(result, 0);
      remember(text, normalised);
      for (const waiter of batch.get(text)!) waiter.resolve(normalised);
    });
  } catch (error) {
    settle(error);
  }
}

function flush(): void {
  flushScheduled = false;
  const pending = queued;
  queued = new Map();
  let batch = new Map<string, PendingLine[]>();
  for (const [text, waiters] of pending) {
    batch.set(text, waiters);
    if (batch.size === TOKENIZE_BATCH_LIMIT) {
      void sendBatch(batch);
      batch = new Map();
    }
  }
  if (batch.size) void sendBatch(batch);
}

function request(text: string): Promise<TokenizedSubtitleLine> {
  const hit = cached(text);
  if (hit) return Promise.resolve(hit);
  const existing = inFlight.get(text);
  if (existing) return existing;

  const promise = new Promise<TokenizedSubtitleLine>((resolve, reject) => {
    const waiters = queued.get(text) ?? [];
    waiters.push({ resolve, reject });
    queued.set(text, waiters);
  }).finally(() => inFlight.delete(text));
  inFlight.set(text, promise);
  // Requests made in the same task (e.g. one IntersectionObserver callback) share one message.
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
  return promise;
}

/** Returns a previously tokenized line from the per-tab cache without messaging the background. */
export function getCachedTokenizedLine(text: string): TokenizedSubtitleLine | undefined {
  return cached(text);
}

/**
 * Tokenizes subtitle lines through the background Kiwi worker, reusing recently analysed lines
 * and combining concurrent requests into a single `tokenize` message.
 * Token IDs use each line's position in `lines`, matching a direct background request.
 */
export async function tokenizeLines(lines: readonly string[]): Promise<TokenizedSubtitleLine[]> {
  if (!lines.length) return [];
  const results = await Promise.all(lines.map(request));
  return results.map((line, index) => withLineIndex(line, index));
}

/** Clears the per-tab cache. Intended for tests. */
export function clearTokenizeCache(): void {
  cache.clear();
}
