import { afterEach, describe, expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { lookupJapaneseWord, tokenizeJapaneseLines } from '@/services/japanese/analysis';
import { importJapaneseDictionary, readJapaneseDictionaryInfo } from '@/services/japanese/dictionary-store';

const form = (text: string) => ({ text, common: true });
const kana = (text: string, appliesToKanji = ['*']) => ({ ...form(text), appliesToKanji });
const sense = (text: string, partOfSpeech = ['n'], appliesToKana = ['*'], appliesToKanji = ['*']) => ({
  gloss: [{ lang: 'eng', text }, { lang: 'ger', text: 'Other language' }], partOfSpeech, appliesToKana, appliesToKanji,
});
const word = (id: string, spelling: string, reading: string, meaning: string, pos = ['n']) => ({
  id, kanji: spelling ? [form(spelling)] : [], kana: [kana(reading)], sense: [sense(meaning, pos)],
});
const source = {
  version: 'test', dictDate: '2026-11-16', tags: { n: 'noun', v1: 'Ichidan verb' },
  words: [
    word('1001', '食べる', 'たべる', 'to eat', ['v1']),
    word('1002', '買う', 'かう', 'to buy', ['v5u']),
    word('1003', '', 'ラーメン', 'noodles'),
    word('1004', '昨日', 'きのう', 'yesterday'),
    word('1005', '', 'は', 'topic marker', ['prt']),
    word('1006', '高い', 'たかい', 'expensive', ['adj-i']),
    word('1007', '読む', 'よむ', 'to read', ['v5m']),
    word('1008', '行く', 'いく', 'to go', ['v5k-s']),
    {
      id: '1009', kanji: [form('生物'), form('生き物')],
      kana: [kana('せいぶつ', ['生物', '生き物']), kana('なまもの', ['生物'])],
      sense: [sense('organism', ['n'], ['せいぶつ']), sense('raw food', ['n'], ['なまもの'], ['生物'])],
    },
  ],
};

// Requests settle in microtasks. A task boundary represents transaction completion.
function installDictionaryStorage() {
  let data = new Map<string, unknown>();
  let failWrite = false;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', {
    open() {
      const request = {
        result: {
          close() {},
          transaction(_name: string, mode: IDBTransactionMode) {
            const records = mode === 'readwrite' ? new Map(data) : data;
            let aborted = false;
            const tx = {
              oncomplete: undefined as (() => void) | undefined,
              onabort: undefined as (() => void) | undefined,
              abort() { aborted = true; tx.onabort?.(); },
              objectStore: () => ({
                clear: () => records.clear(),
                put(value: unknown, key: string) {
                  if (failWrite && key.startsWith('w:')) throw new Error('Write failed');
                  records.set(key, structuredClone(value));
                },
                get(key: string) {
                  const read = { result: records.get(key), onsuccess: undefined as (() => void) | undefined };
                  queueMicrotask(() => read.onsuccess?.());
                  return read;
                },
              }),
            };
            setTimeout(() => {
              if (!aborted) {
                if (mode === 'readwrite') data = records;
                tx.oncomplete?.();
              }
            }, 0);
            return tx;
          },
        },
        onsuccess: undefined as (() => void) | undefined,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return { failNextInstall: () => { failWrite = true; } };
}

function archive(json: object) {
  const text = Buffer.from(JSON.stringify(json));
  const tar = Buffer.alloc(512 + Math.ceil(text.length / 512) * 512 + 1024);
  tar.write('jmdict-eng-test.json');
  tar.write(text.length.toString(8).padStart(11, '0'), 124);
  tar.write('0', 156);
  text.copy(tar, 512);
  return gzipSync(tar);
}

function file(data: Buffer | string, name = 'jmdict-eng-test.json') {
  return new NodeFile([data], name) as unknown as File;
}

describe('local Japanese dictionary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('imports a gzipped archive, records metadata, and keeps the installed index after invalid updates', async () => {
    const storage = installDictionaryStorage();
    await expect(readJapaneseDictionaryInfo()).resolves.toBeUndefined();
    await expect(lookupJapaneseWord('食べる')).rejects.toThrow('Import the Japanese dictionary');
    const info = await importJapaneseDictionary(file(archive(source), 'jmdict-eng-test.json.tgz'));
    expect(info).toMatchObject({ version: 'test', words: 9, date: '2026-11-16', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });

    await expect(importJapaneseDictionary(file('bad archive', 'jmdict-eng-3.6.2+20261116213322.json.tgz'))).rejects.toThrow('checksum');
    await expect(importJapaneseDictionary(file('{"invalid":true}'))).rejects.toThrow('valid JMdict');
    storage.failNextInstall();
    await expect(importJapaneseDictionary(file(JSON.stringify({ ...source, version: 'update' })))).rejects.toThrow('Write failed');
    await expect(readJapaneseDictionaryInfo()).resolves.toEqual(info);
    await expect(lookupJapaneseWord('食べる')).resolves.toMatchObject([{ definitions: ['to eat'] }]);
  });

  it('matches inflections, preserves readings and spelling restrictions and folds half-width kana', async () => {
    installDictionaryStorage();
    await importJapaneseDictionary(file(JSON.stringify(source)));
    for (const [surface, base] of [
      ['食べなかった', '食べる'], ['食べられました', '食べる'], ['買った', '買う'], ['読んでる', '読む'],
      ['行って', '行く'], ['高くなかった', '高い'], ['ﾗｰﾒﾝ', 'ラーメン'],
    ] as const) {
      await expect(lookupJapaneseWord(surface)).resolves.toMatchObject([{ headword: base, originalForm: surface }]);
    }
    const homographs = await lookupJapaneseWord('生物');
    expect(homographs.map((entry) => [entry.japanese?.id, entry.definitions])).toEqual([
      ['1009:せいぶつ', ['organism']], ['1009:なまもの', ['raw food']],
    ]);
    await expect(lookupJapaneseWord('生き物')).resolves.toMatchObject([{ definitions: ['organism'] }]);
    await expect(lookupJapaneseWord('仮想不明語')).resolves.toEqual([]);
  });

  it('keeps UTF-16 offsets and surface text while treating grammar and gaps as unclickable', async () => {
    installDictionaryStorage();
    await importJapaneseDictionary(file(JSON.stringify(source)));
    const text = '🍜 昨日はﾗｰﾒﾝを食べなかった。';
    const [line] = await tokenizeJapaneseLines([text]);
    expect(line?.tokens.map((token) => token.text).join('')).toBe(text);
    expect(line?.tokens.filter(({ clickable }) => clickable).map(({ text, japaneseIds }) => [text, japaneseIds])).toEqual([
      ['昨日', ['1004:きのう']], ['ﾗｰﾒﾝ', ['1003:らーめん']], ['食べなかった', ['1001:たべる']],
    ]);
    for (const token of line!.tokens) expect(text.slice(token.start, token.start + token.length)).toBe(token.text);
    await expect(tokenizeJapaneseLines(['は'.repeat(2001)])).rejects.toThrow('batch is too large');
  });
});
