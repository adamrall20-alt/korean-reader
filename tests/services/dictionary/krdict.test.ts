import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupKoreanWord } from '@/services/dictionary/krdict';

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

  it('tries a morpheme candidate when the surface form has no result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<channel />'))
      .mockResolvedValueOnce(
        new Response('<channel><item><word>가다</word><sense><definition>to go</definition></sense></item></channel>'),
      );

    const entry = await lookupKoreanWord('가요', [
      { text: '가', tag: 'VV', position: 0, length: 1 },
    ], 'test-key');

    expect(entry.headword).toBe('가다');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('builds a dictionary form from a derived verb', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<channel />'))
      .mockResolvedValueOnce(
        new Response('<channel><item><word>공부하다</word><sense><translation><trans_dfn>to study</trans_dfn></translation></sense></item></channel>'),
      );

    await lookupKoreanWord('공부하고', [
      { text: '공부', tag: 'NNG', position: 0, length: 2 },
      { text: '하', tag: 'XSV', position: 2, length: 1 },
      { text: '고', tag: 'EC', position: 3, length: 1 },
    ], 'test-key');

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('q=%EA%B3%B5%EB%B6%80%ED%95%98%EB%8B%A4');
  });
});
