import { AnkiClient, type AnkiCardTemplate, type AnkiCreateModelParams } from '@/services/anki/client';
import { ANKI_DEFAULT_FIELDS, ANKI_DEFAULT_MODEL_NAME, ANKI_FIELD_ROLES } from '@/types/anki';

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
  '.kr-pronunciation { font-size: 16px; color: #6b7280; margin-top: 4px; }',
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

export async function ensureKoreanReaderModel(
  client: AnkiClient,
  existingModels?: string[],
): Promise<string[]> {
  const models = existingModels ?? await client.request('modelNames', undefined);
  if (models.includes(ANKI_DEFAULT_MODEL_NAME)) return models;
  await client.request('createModel', buildKoreanReaderModelParams());
  return [...models, ANKI_DEFAULT_MODEL_NAME];
}
