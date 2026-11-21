import type { VocabularyEntry } from '@/types/vocabulary';

export const DESKTOP_BRIDGE_URL = 'http://127.0.0.1:17421';
const BATCH_SIZE = 25;
const REQUEST_TIMEOUT_MS = 4000;

function normalizeHeadword(value: string): string {
  return value.trim().normalize('NFC');
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function pushEntriesToDesktop(
  entries: VocabularyEntry[],
  baseUrl = DESKTOP_BRIDGE_URL,
): Promise<boolean> {
  const mined = entries.filter((entry) => entry.contexts.length > 0);
  if (mined.length === 0) return true;

  try {
    const response = await fetchWithTimeout(`${baseUrl}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mined),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function syncMissingEntriesToDesktop(
  allEntries: VocabularyEntry[],
  baseUrl = DESKTOP_BRIDGE_URL,
): Promise<{ synced: number; reachable: boolean }> {
  const minedEntries = allEntries.filter((entry) => entry.contexts.length > 0);
  if (minedEntries.length === 0) {
    return { synced: 0, reachable: true };
  }

  let existingHeadwords: Set<string>;
  try {
    const response = await fetchWithTimeout(`${baseUrl}/headwords`, { method: 'GET' });
    if (!response.ok) {
      return { synced: 0, reachable: false };
    }
    const payload = (await response.json()) as { ok?: boolean; headwords?: unknown };
    if (!payload.ok || !Array.isArray(payload.headwords)) {
      return { synced: 0, reachable: false };
    }
    existingHeadwords = new Set(
      payload.headwords
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeHeadword),
    );
  } catch {
    return { synced: 0, reachable: false };
  }

  const missing = minedEntries.filter(
    (entry) => !existingHeadwords.has(normalizeHeadword(entry.headword)),
  );

  if (missing.length === 0) {
    return { synced: 0, reachable: true };
  }

  let synced = 0;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const ok = await pushEntriesToDesktop(batch, baseUrl);
    if (!ok) {
      return { synced, reachable: false };
    }
    synced += batch.length;
  }

  return { synced, reachable: true };
}
