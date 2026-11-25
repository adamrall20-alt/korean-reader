import { AnkiClient, type AnkiCardTemplate, type AnkiCreateModelParams } from '@/services/anki/client';
import { ANKI_DEFAULT_FIELDS, ANKI_DEFAULT_MODEL_NAME, ANKI_FIELD_ROLES, JAPANESE_ANKI_MODEL, JAPANESE_ANKI_ID_FIELD } from '@/types/anki';

export const KOREAN_READER_MODEL_FIELDS = ANKI_FIELD_ROLES.map((role) => ANKI_DEFAULT_FIELDS[role]);

export const KOREAN_READER_CARD_TEMPLATES: AnkiCardTemplate[] = [
  {
    Name: 'Card 1',
    Front: [
      '{{#Audio}}<div class="kr-audio">{{Audio}}</div>{{/Audio}}',
      '{{#Image}}<div class="kr-image">{{Image}}</div>{{/Image}}',
      '<div class="kr-sentence" lang="ko">{{Sentence}}</div>',
    ].join('\n'),
    Back: [
      '{{FrontSide}}',
      '<hr id="answer">',
      '<div class="kr-definition">{{Definition}}</div>',
      '<div class="kr-word" lang="ko">{{Focus Word}}</div>',
      '{{#Pronunciation}}<div class="kr-pronunciation" lang="ko">[{{Pronunciation}}]</div>{{/Pronunciation}}',
    ].join('\n'),
  },
];

export const JAPANESE_READER_CARD_TEMPLATES: AnkiCardTemplate[] = [
  {
    Name: 'Card 1',
    Front: [
      '<div class="kr-word" lang="ja">{{Focus Word}}</div>',
      '{{#Pronunciation}}<div class="kr-pronunciation" lang="ja">[{{Pronunciation}}]</div>{{/Pronunciation}}',
      '{{#Audio}}<div class="kr-audio">{{Audio}}</div>{{/Audio}}',
      '{{#Image}}<div class="kr-image">{{Image}}</div>{{/Image}}',
      '<div class="kr-sentence" lang="ja">{{Sentence}}</div>',
    ].join('\n'),
    Back: [
      '{{FrontSide}}',
      '<hr id="answer">',
      '<div class="kr-definition">{{Definition}}</div>',
    ].join('\n'),
  },
];

const LEGACY_JAPANESE_CARD_TEMPLATE = {
  Front: KOREAN_READER_CARD_TEMPLATES[0]!.Front.replaceAll('lang="ko"', 'lang="ja"'),
  Back: KOREAN_READER_CARD_TEMPLATES[0]!.Back.replaceAll('lang="ko"', 'lang="ja"'),
};

export const KOREAN_READER_CARD_CSS = [
  '.card {',
  '  font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif;',
  '  font-size: 20px;',
  '  line-height: 1.6;',
  '  text-align: center;',
  '  color: #1f2937;',
  '  background-color: #ffffff;',
  '  padding: 20px;',
  '}',
  '.nightMode .card, .night_mode .card {',
  '  color: #f3f4f6;',
  '  background-color: #18181b;',
  '}',
  '.kr-audio { margin-bottom: 12px; }',
  '.kr-image img { max-width: 100%; max-height: 300px; border-radius: 8px; margin: 0 auto 14px; display: block; }',
  '.kr-sentence { font-size: 26px; font-weight: 500; margin: 12px 0; }',
  '.kr-sentence span { color: #f59e0b; font-weight: 600; }',
  '#answer { border: 0; border-top: 1px solid rgba(156, 163, 175, 0.35); margin: 18px 0; }',
  '.kr-definition { font-size: 18px; text-align: left; max-width: 640px; margin: 0 auto 16px; }',
  '.kr-word { font-size: 24px; font-weight: 700; color: #f59e0b; }',
  '.kr-pronunciation { font-size: 16px; color: #6b7280; margin-top: 4px; margin-bottom: 12px; }',
  '.nightMode .kr-pronunciation, .night_mode .kr-pronunciation { color: #9ca3af; }',
].join('\n');

export function buildKoreanReaderModelParams(): AnkiCreateModelParams {
  return {
    modelName: ANKI_DEFAULT_MODEL_NAME,
    inOrderFields: [...KOREAN_READER_MODEL_FIELDS],
    css: KOREAN_READER_CARD_CSS,
    cardTemplates: KOREAN_READER_CARD_TEMPLATES.map((template) => ({ ...template })),
  };
}

export function buildJapaneseReaderModelParams(): AnkiCreateModelParams {
  const korean = buildKoreanReaderModelParams();
  return {
    ...korean,
    modelName: JAPANESE_ANKI_MODEL,
    inOrderFields: [JAPANESE_ANKI_ID_FIELD, ...korean.inOrderFields],
    css: KOREAN_READER_CARD_CSS.replace('"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR"', '"Hiragino Sans", "Yu Gothic", "Noto Sans JP"'),
    cardTemplates: JAPANESE_READER_CARD_TEMPLATES.map((template) => ({ ...template })),
  };
}

export async function ensureReaderModel(
  client: AnkiClient,
  existingModels?: string[],
  modelName = ANKI_DEFAULT_MODEL_NAME,
): Promise<string[]> {
  const models = existingModels ?? await client.request('modelNames', undefined);
  if (models.includes(modelName)) {
    if (modelName === JAPANESE_ANKI_MODEL) {
      const templates = await client.request('modelTemplates', { modelName }).catch(() => null);
      const card = templates?.['Card 1'];
      if (card && card.Front.trim() === LEGACY_JAPANESE_CARD_TEMPLATE.Front && card.Back.trim() === LEGACY_JAPANESE_CARD_TEMPLATE.Back) {
        const next = JAPANESE_READER_CARD_TEMPLATES[0]!;
        await client.request('updateModelTemplates', {
          model: { name: modelName, templates: { [next.Name]: { Front: next.Front, Back: next.Back } } },
        });
      }
    }
    return models;
  }
  await client.request('createModel', modelName === JAPANESE_ANKI_MODEL ? buildJapaneseReaderModelParams() : buildKoreanReaderModelParams());
  return [...models, modelName];
}
