import {
  changeVocabulary, listVocabulary, markHeadwordsKnown, markJapaneseWordKnown, mineWord, readVocabularySummary,
} from '@/services/storage/vocabulary';
import { isSubtitleAudio } from '@/types/audio';
import { isOptionalReaderLanguage } from '@/types/language';
import type { VocabularyMessage, VocabularyResponse } from '@/types/vocabulary';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(hasText);
}

function isLexemeId(value: unknown): value is string {
  return hasText(value) && value.length <= 150 && value === value.trim().normalize('NFC');
}

function isJapaneseLexeme(value: unknown): boolean {
  return isRecord(value) && isLexemeId(value.id) && hasText(value.reading) && isStringList(value.aliases);
}

function isFocusSpan(span: unknown, sentence: string, originalForm: string): boolean {
  return isRecord(span) && typeof span.start === 'number' && Number.isSafeInteger(span.start) && span.start >= 0 &&
    span.length === originalForm.length && sentence.slice(span.start, span.start + originalForm.length) === originalForm;
}

function isWebSource(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = URL.parse(value);
  return url !== null && (url.protocol === 'https:' || url.protocol === 'http:');
}

function isMineMessage(message: Record<string, unknown>): boolean {
  const { entry, context, machineDefinitions } = message;
  return isRecord(entry) && hasText(entry.headword) && hasText(entry.originalForm) &&
    (message.language === 'ja' ? isJapaneseLexeme(entry.japanese) : entry.japanese === undefined) &&
    isStringList(entry.definitions) && isStringList(entry.koreanDefinitions) &&
    isStringList(entry.examples) && isStringList(machineDefinitions) &&
    (entry.definitions.length > 0 || entry.koreanDefinitions.length > 0) &&
    [entry.partOfSpeech, entry.pronunciation].every((value) => value === undefined || typeof value === 'string') &&
    [entry.hanja, entry.conjugations].every((value) => value === undefined || isStringList(value)) &&
    isRecord(context) && hasText(context.sentence) && context.originalForm === entry.originalForm &&
    (message.language === 'ja' || context.focusSpan !== undefined
      ? isFocusSpan(context.focusSpan, context.sentence, entry.originalForm)
      : true) &&
    typeof context.sourceTitle === 'string' && isWebSource(context.sourceUrl) &&
    (context.image === undefined || (typeof context.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(context.image) && context.image.length <= 8000000)) &&
    (context.audio === undefined || isSubtitleAudio(context.audio)) &&
    (context.timestamp === undefined ||
      (typeof context.timestamp === 'number' && Number.isFinite(context.timestamp) && context.timestamp >= 0));
}

export function isVocabularyMessage(message: unknown): message is VocabularyMessage {
  if (!isRecord(message) || !isOptionalReaderLanguage(message.language)) return false;
  if (message.type === 'list-vocabulary' || message.type === 'get-vocabulary-summary') return true;
  if (message.type === 'mine-word') return isMineMessage(message);
  if (!hasText(message.headword)) return false;
  if (message.type === 'mark-word-known') {
    return message.language === 'ja' ? isJapaneseLexeme(message.japanese) : message.japanese === undefined;
  }
  if (message.language === 'ja' && !isLexemeId(message.lexemeId)) return false;

  return message.type === 'delete-vocabulary' ||
    (message.type === 'edit-vocabulary' && isStringList(message.definitions)) ||
    (message.type === 'set-vocabulary-status' && (message.status === 'known' || message.status === 'unknown'));
}

export async function handleVocabularyMessage(message: VocabularyMessage): Promise<VocabularyResponse> {
  if (message.type === 'mine-word') return { ok: true, outcome: await mineWord(message) };
  if (message.type === 'mark-word-known') {
    if (message.language === 'ja') await markJapaneseWordKnown(message.headword, message.japanese!);
    else await markHeadwordsKnown([message.headword]);
    return { ok: true };
  }

  if (message.type === 'get-vocabulary-summary') return { ok: true, summary: await readVocabularySummary(message.language) };

  if (message.type !== 'list-vocabulary') await changeVocabulary(message);
  return { ok: true, entries: await listVocabulary(message.language) };
}
