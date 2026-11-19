import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dictionaryCache from '@/services/dictionary/cache';
import { lookupKoreanWord } from '@/services/dictionary/krdict';
import type { DictionaryEntry } from '@/types/messages';

describe('KRDict lookup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a dictionary result and keeps the original form', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`
        <channel>
          <item>
            <word>먹다</word>
            <pronunciation_info><pronunciation>먹따</pronunciation></pronunciation_info>
            <pos>동사</pos>
            <sense>
              <definition>음식을 입에 넣어서 씹고 삼키다.</definition>
              <translation><trans_dfn>to eat</trans_dfn></translation>
            </sense>
            <example>밥을 먹다.</example>
          </item>
        </channel>
      `),
    );

    const entry = await lookupKoreanWord('먹어요', [
      { text: '먹', tag: 'VV', position: 0, length: 1 },
    ], 'test-key');

    expect(entry).toEqual({
      headword: '먹다',
      originalForm: '먹어요',
      koreanDefinitions: ['음식을 입에 넣어서 씹고 삼키다.'],
      definitions: ['to eat'],
      partOfSpeech: '동사',
      pronunciation: '먹따',
      examples: ['밥을 먹다.'],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('key=test-key');
  });

  it('includes definitions from matching homonyms and excludes other headwords', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`
      <channel>
        <item><word>배</word><sense><translation><trans_dfn>pear</trans_dfn></translation></sense></item>
        <item><word>다른</word><sense><translation><trans_dfn>other</trans_dfn></translation></sense></item>
        <item><word>배</word><sense><translation><trans_dfn>boat</trans_dfn></translation></sense></item>
      </channel>
    `));
    await expect(lookupKoreanWord('배', [], 'test-key')).resolves.toMatchObject({ definitions: ['pear', 'boat'] });
  });

  it('rejects a mismatched headword and falls back to the surface form', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<channel><item><word>다른 말</word></item></channel>'))
      .mockResolvedValueOnce(
        new Response('<channel><item><word>가요</word><sense><definition>song</definition></sense></item></channel>'),
      );

    const entry = await lookupKoreanWord('가요', [
      { text: '가', tag: 'VV', position: 0, length: 1 },
    ], 'test-key');

    expect(entry.headword).toBe('가요');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('builds a dictionary form from a derived verb', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('<channel><item><word>공부하다</word><sense><translation><trans_dfn>to study</trans_dfn></translation></sense></item></channel>'),
      );

    await lookupKoreanWord('공부하고', [
      { text: '공부', tag: 'NNG', position: 0, length: 2 },
      { text: '하', tag: 'XSV', position: 2, length: 1 },
      { text: '고', tag: 'EC', position: 3, length: 1 },
    ], 'test-key');

    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('q')).toBe('공부하다');
  });
  it('reads optional dictionary details and excludes non-English translations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(`
        <channel><item><word>공부하다</word><target_code>123</target_code>
          <sense><translation><trans_lang>일본어</trans_lang><trans_dfn>学ぶ</trans_dfn></translation>
            <translation><trans_lang>영어</trans_lang><trans_dfn>to study</trans_dfn></translation>
          </sense>
        </item></channel>
      `))
      .mockResolvedValueOnce(new Response(`
        <channel><item><word_info><word>공부하다</word>
          <original_language_info><original_language>工夫</original_language></original_language_info>
          <pronunciation_info><pronunciation>공부하다</pronunciation></pronunciation_info>
          <conju_info><conjugation_info><conjugation>공부하여</conjugation></conjugation_info></conju_info>
          <sense_info><example_info><example>한국어를 공부하다.</example></example_info></sense_info>
        </word_info></item></channel>
      `));

    await expect(lookupKoreanWord('공부하다', [], 'test-key')).resolves.toMatchObject({
      definitions: ['to study'],
      pronunciation: '공부하다',
      hanja: ['工夫'],
      conjugations: ['공부하여'],
      examples: ['한국어를 공부하다.'],
    });
    const search = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(search.searchParams.get('method')).toBe('exact');
    expect(search.searchParams.get('trans_lang')).toBe('1');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/view?');
  });

  it('reports a KRDict key error without treating it as a missing word', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<error><error_code>020</error_code><message>Unregistered key</message></error>',
    ));
    await expect(lookupKoreanWord('나무', [], 'test-key')).rejects.toThrow('Unregistered key');
  });

  it('uses an English gloss from entry details when search has only Korean definitions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(`
        <channel><item><word>장난하다</word><target_code>123</target_code>
          <sense><definition>재미로 하는 짓을 하다.</definition></sense>
        </item></channel>
      `))
      .mockResolvedValueOnce(new Response(`
        <channel><item><word_info><word>장난하다</word>
          <sense_info>
            <translation><trans_lang>English</trans_lang><trans_word>to fool around</trans_word>
              <trans_dfn /></translation>
            <example_info><example>친구와 장난하다.</example></example_info>
          </sense_info>
        </word_info></item></channel>
      `));
    await expect(lookupKoreanWord('장난하다', [], 'test-key')).resolves.toMatchObject({
      definitions: ['to fool around'],
      koreanDefinitions: ['재미로 하는 짓을 하다.'],
      examples: ['친구와 장난하다.'],
    });
    const details = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(details.searchParams.get('translated')).toBe('y');
    expect(details.searchParams.get('trans_lang')).toBe('1');
  });

  it('reports a missing dictionary entry after trying the available forms', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<channel></channel>'));
    await expect(lookupKoreanWord('없는말', [], 'test-key'))
      .rejects.toThrow('No dictionary entry was found');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports an HTTP error instead of displaying an empty result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(lookupKoreanWord('나무', [], 'test-key')).rejects.toThrow('HTTP 503');
  });
});

describe('headword-level dictionary cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function installMemoryCache() {
    const store = new Map<string, DictionaryEntry>();
    vi.spyOn(dictionaryCache, 'getCachedDictionaryEntry').mockImplementation(async (key) => store.get(key));
    vi.spyOn(dictionaryCache, 'cacheDictionaryEntry').mockImplementation(async (key, entry) => {
      store.set(key, entry);
    });
    return store;
  }

  it('reuses a cached headword across different conjugations without repeating API calls', async () => {
    installMemoryCache();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`
        <channel>
          <item>
            <word>먹다</word>
            <sense>
              <definition>음식을 입에 넣어서 씹고 삼키다.</definition>
              <translation><trans_dfn>to eat</trans_dfn></translation>
            </sense>
          </item>
        </channel>
      `),
    );

    const first = await lookupKoreanWord(
      '먹어요',
      [{ text: '먹', tag: 'VV', position: 0, length: 1 }],
      'test-key',
    );
    const second = await lookupKoreanWord(
      '먹었어요',
      [
        { text: '먹', tag: 'VV', position: 0, length: 1 },
        { text: '었', tag: 'EP', position: 1, length: 1 },
      ],
      'test-key',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.headword).toBe('먹다');
    expect(first.originalForm).toBe('먹어요');
    expect(second.headword).toBe('먹다');
    expect(second.originalForm).toBe('먹었어요');
    expect(second.definitions).toEqual(['to eat']);
  });

  it('reuses a cached fallback candidate by headword and caches the fallback candidate list', async () => {
    const store = installMemoryCache();
    store.set(JSON.stringify(['headword-v1', '가요']), {
      headword: '가요',
      originalForm: '가요',
      koreanDefinitions: ['노래.'],
      definitions: ['song'],
      examples: [],
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<channel></channel>'));

    const first = await lookupKoreanWord(
      '가요',
      [{ text: '가', tag: 'VV', position: 0, length: 1 }],
      'test-key',
    );
    expect(first).toMatchObject({ headword: '가요', originalForm: '가요', definitions: ['song'] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('q')).toBe('가다');

    const second = await lookupKoreanWord(
      '가요',
      [{ text: '가', tag: 'VV', position: 0, length: 1 }],
      'test-key',
    );
    expect(second).toMatchObject({ headword: '가요', originalForm: '가요', definitions: ['song'] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('hits pre-existing exact-v4 cache entries and backfills the headword key', async () => {
    const store = installMemoryCache();
    store.set(JSON.stringify(['exact-v4', '먹다', '먹어요']), {
      headword: '먹다',
      originalForm: '먹어요',
      koreanDefinitions: ['음식을 먹다.'],
      definitions: ['to eat'],
      examples: [],
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const first = await lookupKoreanWord(
      '먹어요',
      [{ text: '먹', tag: 'VV', position: 0, length: 1 }],
      'test-key',
    );
    const second = await lookupKoreanWord(
      '먹고',
      [
        { text: '먹', tag: 'VV', position: 0, length: 1 },
        { text: '고', tag: 'EC', position: 1, length: 1 },
      ],
      'test-key',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(first.originalForm).toBe('먹어요');
    expect(second.originalForm).toBe('먹고');
    expect(store.get(JSON.stringify(['headword-v1', '먹다']))?.headword).toBe('먹다');
  });

  it('falls back cleanly to KRDict when cache reads or writes fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(dictionaryCache, 'getCachedDictionaryEntry').mockRejectedValue(new Error('Read failed'));
    vi.spyOn(dictionaryCache, 'cacheDictionaryEntry').mockRejectedValue(new Error('Write failed'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<channel><item><word>나무</word><sense><translation><trans_dfn>tree</trans_dfn></translation></sense></item></channel>'),
    );

    await expect(lookupKoreanWord('나무', [], 'test-key')).resolves.toMatchObject({
      headword: '나무',
      definitions: ['tree'],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
  });
});
