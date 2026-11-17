import { changeVocabulary, listVocabulary, mineWord } from '@/services/storage/vocabulary';
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

function isMineMessage(message: Record<string, unknown>): boolean {
  const { entry, context, machineDefinitions } = message;
  return isRecord(entry) && hasText(entry.headword) && hasText(entry.originalForm) &&
    isStringList(entry.definitions) && isStringList(entry.koreanDefinitions) &&
    isStringList(entry.examples) && isStringList(machineDefinitions) &&
    (entry.definitions.length > 0 || entry.koreanDefinitions.length > 0) &&
    [entry.partOfSpeech, entry.pronunciation].every((value) => value === undefined || typeof value === 'string') &&
    [entry.hanja, entry.conjugations].every((value) => value === undefined || isStringList(value)) &&
    isRecord(context) && hasText(context.sentence) && context.originalForm === entry.originalForm &&
    typeof context.sourceTitle === 'string' && typeof context.sourceUrl === 'string' &&
    /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/.test(context.sourceUrl) &&
    (context.image === undefined || (typeof context.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(context.image) && context.image.length <= 8000000)) &&
    (context.timestamp === undefined ||
      (typeof context.timestamp === 'number' && Number.isFinite(context.timestamp) && context.timestamp >= 0));
}

export function isVocabularyMessage(message: unknown): message is VocabularyMessage {
  if (!isRecord(message)) return false;
  if (message.type === 'list-vocabulary') return true;
  if (message.type === 'mine-word') return isMineMessage(message);
  if (!hasText(message.headword)) return false;

  return message.type === 'delete-vocabulary' ||
    (message.type === 'edit-vocabulary' && isStringList(message.definitions)) ||
    (message.type === 'set-vocabulary-status' && (message.status === 'known' || message.status === 'unknown'));
}

export async function handleVocabularyMessage(message: VocabularyMessage): Promise<VocabularyResponse> {
  if (message.type === 'mine-word') return { ok: true, outcome: await mineWord(message) };

  if (message.type !== 'list-vocabulary') await changeVocabulary(message);
  return { ok: true, entries: await listVocabulary() };
}
