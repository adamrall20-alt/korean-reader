import { buildJapaneseIndex, formBucket, PINNED_JMDICT_ARCHIVE, wordBucket, type JapaneseDictionaryInfo, type JapaneseWord } from './jmdict';

import { japaneseRankKey, parseJitenRanks, parseKanjidic, type KanjiDetail } from './extras';
import type { DictionaryEntry } from '@/types/messages';

const DB_NAME = 'korean-reader-japanese-dictionary';
const STORE = 'index';
const EXTRAS = 'extras';
const MAX_BYTES = 170 * 1024 * 1024;
const PINNED_SHA = '956a1cbd6478b86bc351d26bb33c74deedc8737ebfccc396a95e313199ccbfce';
const decoder = new TextDecoder('utf-8', { fatal: true });

function openDictionary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) request.result.createObjectStore(STORE);
      if (oldVersion < 2) request.result.createObjectStore(EXTRAS);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open the Japanese dictionary.'));
  });
}

async function withDictionary<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>, storeName = STORE): Promise<T> {
  const db = await openDictionary();
  try {
    const tx = db.transaction(storeName, mode);
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Could not access the Japanese dictionary.'));
    });
    try {
      const [result] = await Promise.all([operation(tx.objectStore(storeName)), finished]);
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have ended. */ }
      throw error;
    }
  } finally {
    db.close();
  }
}

function read<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function unpack(file: Blob): Promise<Uint8Array> {
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw new Error('The Japanese dictionary is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const tar = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    tar.set(chunk, offset);
    offset += chunk.length;
  }
  for (let start = 0; start + 512 <= tar.length;) {
    const header = tar.subarray(start, start + 512);
    const name = decoder.decode(header.subarray(0, 100)).split('\0')[0]!;
    if (!name) break;
    const sizeText = decoder.decode(header.subarray(124, 136)).replace(/\0/gu, '').trim();
    if (!/^[0-7]+$/u.test(sizeText)) break;
    const size = Number.parseInt(sizeText, 8);
    const body = start + 512;
    if (body + size > tar.length) break;
    if ((header[156] === 0 || header[156] === 48) && name.endsWith('.json')) return tar.subarray(body, body + size);
    start = body + Math.ceil(size / 512) * 512;
  }
  throw new Error('The archive does not contain a JMdict JSON file.');
}

export async function importJapaneseDictionary(file: File): Promise<JapaneseDictionaryInfo> {
  if (file.size > MAX_BYTES) throw new Error('The Japanese dictionary is too large.');
  const raw = await file.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (file.name === PINNED_JMDICT_ARCHIVE && sha256 !== PINNED_SHA) {
    throw new Error('The JMdict archive checksum did not match. Download a fresh copy.');
  }
  const signature = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  const isGzip = signature[0] === 31 && signature[1] === 139;
  let source: unknown;
  try {
    source = JSON.parse(decoder.decode(isGzip ? await unpack(file) : raw));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The ')) throw error;
    throw new Error('Could not read this dictionary. Choose an English JMdict .json or .json.tgz file.');
  }
  const { info, labels, forms, words } = buildJapaneseIndex(source, sha256);
  return withDictionary('readwrite', async (store) => {
    store.clear();
    store.put(info, 'info');
    store.put(labels, 'labels');
    for (const [key, entries] of forms) store.put(entries, 'f:' + key);
    for (const [key, entries] of words) store.put(entries, 'w:' + key);
    return info;
  });
}

export function readJapaneseDictionaryInfo(): Promise<JapaneseDictionaryInfo | undefined> {
  return withDictionary('readonly', (store) => read<JapaneseDictionaryInfo>(store, 'info'));
}

export function readJapaneseDictionary(forms: readonly string[]) {
  return withDictionary('readonly', async (store) => {
    const labels = await read<Record<string, string>>(store, 'labels');
    if (!labels) throw new Error('Import the Japanese dictionary in Settings before looking up words.');
    const buckets = new Set(forms.filter(Boolean).map(formBucket));
    const wordsByForm = new Map<string, string[]>();
    const formIndex = new Map(await Promise.all([...buckets].map(async (key) =>
      [key, await read<Map<string, string[]>>(store, 'f:' + key)] as const)));
    const wordBuckets = new Set<string>();
    for (const form of forms) {
      if (!form) continue;
      const ids = formIndex.get(formBucket(form))?.get(form);
      if (!ids) continue;
      wordsByForm.set(form, ids);
      for (const id of ids) wordBuckets.add(wordBucket(id));
    }
    const wordIndex = new Map(await Promise.all([...wordBuckets].map(async (key) =>
      [key, await read<Map<string, JapaneseWord>>(store, 'w:' + key)] as const)));
    return {
      labels,
      get: (form: string) => (wordsByForm.get(form) ?? []).flatMap((id) => {
        const word = wordIndex.get(wordBucket(id))?.get(id);
        return word ? [word] : [];
      }),
    };
  });
}

async function saveSupplement(prefix: string, values: Map<string, unknown>, name: string) {
  return withDictionary('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    for (const [key, value] of values) store.put(value, prefix + key);
    store.put(name, prefix);
    return values.size;
  }, EXTRAS);
}

export async function importJapaneseSupplement(file: File, kind: 'kanji' | 'ranks'): Promise<number> {
  if (file.size > MAX_BYTES) throw new Error('The file is too large.');
  if (kind === 'ranks') {
    const buckets = new Map<string, Map<string, number>>();
    const ranks = parseJitenRanks(await file.text());
    for (const [key, rank] of ranks) {
      const prefix = formBucket(key);
      const bucket = buckets.get(prefix) ?? new Map<string, number>();
      bucket.set(key, rank);
      buckets.set(prefix, bucket);
    }
    await saveSupplement('r:', buckets, file.name);
    return ranks.size;
  }
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const raw = signature[0] === 31 && signature[1] === 139 ? await unpack(file) : await file.arrayBuffer();
  return saveSupplement('k:', parseKanjidic(JSON.parse(decoder.decode(raw))), file.name);
}

export async function enrichJapaneseEntries(entries: DictionaryEntry[]) {
  return withDictionary('readonly', async (store) => {
    const characters = new Set(entries.flatMap(({ headword }) => headword.match(/\p{Script=Han}/gu) ?? []));
    const formKeys = entries.map(({ headword, japanese }) => [...new Set([headword, ...(japanese?.aliases ?? [])])]
      .map((word) => [japaneseRankKey(word, japanese?.reading), japaneseRankKey(word)] as const));
    const prefixes = new Set(formKeys.flatMap((keys) => keys.map(([key]) => formBucket(key))));
    const [kanji, ranks] = await Promise.all([
      Promise.all([...characters].map(async (character) => [character, await read<KanjiDetail>(store, 'k:' + character)] as const)),
      Promise.all([...prefixes].map(async (prefix) => [prefix, await read<Map<string, number>>(store, 'r:' + prefix)] as const)),
    ]);
    const details = new Map(kanji);
    const frequencies = new Map(ranks);
    return entries.map((entry, index) => {
      const kanjiDetails = [...new Set(entry.headword)].flatMap((character) => details.get(character) ?? []);
      const frequencyRank = formKeys[index]!.map(([exact, plain]) => {
        const bucket = frequencies.get(formBucket(exact));
        return bucket?.get(exact) ?? bucket?.get(plain);
      }).find((rank) => rank !== undefined);
      return { ...entry, ...(kanjiDetails.length ? { kanjiDetails } : {}), ...(frequencyRank ? { frequencyRank } : {}) };
    });
  }, EXTRAS);
}
