import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PracticeFeedback, PracticeQuestion } from '../shared/api';
import { getCardDetail } from './library';
import type { LocalMediaStore } from './media';

interface Candidate {
  id: string;
  headword: string;
  part_of_speech: string | null;
  definitions_json: string;
  korean_definitions_json: string;
  context_id: string;
  sentence: string;
  original_form: string;
  mined_at: string;
  difficult: number;
}

interface PendingQuestion {
  question: PracticeQuestion;
  cardId: string;
  contextId: string;
  answer: string;
  meaning: string;
}

const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'one', 'someone', 'something', 'be']);

function uniqueOccurrence(sentence: string, form: string) {
  if (!form || !/\p{Script=Hangul}/u.test(form)) return null;
  const start = sentence.indexOf(form);
  if (start < 0 || sentence.indexOf(form, start + 1) >= 0) return null;
  const before = sentence.slice(0, start);
  const after = sentence.slice(start + form.length);
  if (WORD_CHARACTER.test(before.at(-1) ?? '') || WORD_CHARACTER.test(after[0] ?? '')) return null;
  return { before, form, after };
}

function glossTokens(value: string): string[] {
  return (value.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => !STOP_WORDS.has(word));
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function questionsFromLibrary(db: DatabaseSync, random: () => number, now: Date): PendingQuestion[] {
  const candidates = (db.prepare(`SELECT c.id, c.headword, c.part_of_speech, c.definitions_json,
    c.korean_definitions_json, x.id AS context_id, x.sentence, x.original_form, x.mined_at,
    COALESCE(s.lapses, 0) + EXISTS(SELECT 1 FROM review_logs r WHERE r.card_id = c.id AND r.rating <= 2) AS difficult
    FROM cards c JOIN contexts x ON x.id = COALESCE(c.preferred_context_id,
      (SELECT id FROM contexts WHERE card_id = c.id ORDER BY mined_at, rowid LIMIT 1))
    LEFT JOIN schedules s ON s.card_id = c.id`).all() as unknown as Candidate[]).map((row) => {
      const english = JSON.parse(row.definitions_json) as string[];
        const korean = JSON.parse(row.korean_definitions_json) as string[];
      const glosses = (english.length ? english : korean).map((value) => {
        const normalized = value.trim().normalize('NFC');
        const separator = normalized.indexOf('=');
        // Older Korean Reader Anki cards wrote “headword = gloss: definition”.
        return separator >= 0 && normalized.slice(0, separator).trim() === row.headword
          ? normalized.slice(separator + 1).trim()
          : normalized;
      });
      const meaning = [...new Set(glosses.filter(Boolean))];
      // A saved surface form keeps the question tied to the actual sentence.
      const occurrence = uniqueOccurrence(row.sentence.normalize('NFC'), row.original_form.normalize('NFC').trim());
      const age = (+now - Date.parse(row.mined_at)) / 86_400_000;
      const weight = 1 + (age >= 0 && age <= 30 ? 2 : 0) + Math.min(row.difficult, 3);
      return { row, meaning, occurrence, tokens: glossTokens(meaning.join(' ')), score: random() ** (1 / weight) };
    });

  const questions: PendingQuestion[] = [];
  const eligible = candidates.filter(({ meaning, tokens }) => meaning.length === 1 && tokens.length > 0);
  const languageOf = (value: string) => /\p{Script=Hangul}/u.test(value) ? 'ko' : 'en';
  const pools = new Map<string, typeof eligible>();
  const taggedByLanguage = new Map<string, typeof eligible>();
  for (const item of shuffled(eligible, random)) {
    const language = languageOf(item.meaning[0]!);
    const key = `${language}:${item.row.part_of_speech ?? ''}`;
    const pool = pools.get(key) ?? [];
    pool.push(item);
    pools.set(key, pool);
    if (item.row.part_of_speech) {
      const tagged = taggedByLanguage.get(language) ?? [];
      tagged.push(item);
      taggedByLanguage.set(language, tagged);
    }
  }
  for (const candidate of [...eligible].sort((a, b) => b.score - a.score)) {
    const { row, meaning, occurrence, tokens } = candidate;
    if (!occurrence) continue;
    const answerMeaning = meaning[0]!;
    const language = languageOf(answerMeaning);
    const exact = pools.get(`${language}:${row.part_of_speech ?? ''}`) ?? [];
    const fallback = row.part_of_speech ? pools.get(`${language}:`) ?? [] : taggedByLanguage.get(language) ?? [];
    const compatible = [...exact, ...fallback];
    if (compatible.length < 4) continue;
    const distractors = new Map<string, string>();
    const usedGlossTokens = new Set(tokens);
    for (const other of compatible) {
      if (other === candidate || other.tokens.some((token) => usedGlossTokens.has(token))) continue;
      const option = other.meaning[0]!;
      const key = option.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      if (key && !distractors.has(key)) {
        distractors.set(key, option);
        other.tokens.forEach((token) => usedGlossTokens.add(token));
      }
      if (distractors.size === 3) break;
    }
    if (distractors.size < 3) continue;
    questions.push({
      question: {
        id: randomUUID(), type: 'meaning', before: occurrence.before, after: occurrence.after,
        target: occurrence.form,
        options: shuffled([answerMeaning, ...distractors.values()], random),
      },
      cardId: row.id, contextId: row.context_id, answer: answerMeaning, meaning: answerMeaning,
    });
    if (questions.length >= 10) break;
  }
  return questions;
}

export function createPracticeSession(db: DatabaseSync, media: LocalMediaStore, random = Math.random, now = new Date()) {
  const questions = questionsFromLibrary(db, random, now);
  const results = new Map<string, PracticeFeedback>();
  return {
    questions: questions.map(({ question }) => question),
    answer(id: unknown, choice: unknown): PracticeFeedback {
      const item = questions[results.size];
      if (typeof id === 'string' && results.has(id)) return results.get(id)!;
      if (!item || item.question.id !== id || typeof choice !== 'number' || !Number.isInteger(choice) ||
        choice < 0 || choice >= item.question.options.length) throw new Error('Invalid practice answer.');
      const correctIndex = item.question.options.indexOf(item.answer);
      const correct = choice === correctIndex;
      const card = getCardDetail(db, media, item.cardId);
      if (!card) throw new Error('This card is no longer available. Start a new practice session.');
      const context = card.contexts.find(({ id }) => id === item.contextId);
      db.prepare(`INSERT INTO practice_results (id, card_id, question_type, correct, answered_at)
        VALUES (?, ?, ?, ?, ?)`).run(item.question.id, item.cardId, item.question.type, Number(correct), new Date().toISOString());
      const feedback = { correct, correctIndex, headword: card.headword, meaning: item.meaning,
        sentence: context?.sentence ?? `${item.question.before}${item.question.target}${item.question.after}`,
        imageDataUrl: context?.imageDataUrl, audioDataUrl: context?.audioDataUrl };
      results.set(item.question.id, feedback);
      return feedback;
    },
  };
}
