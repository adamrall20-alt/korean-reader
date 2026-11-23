import type { TokenizedSubtitleLine } from '@/types/messages';
import { decomposeMorphemes, headwordAliases, isKnownHeadword } from './dictionary-forms';

/** Canonical lexical words, with optional whole-compound equivalents. Never depends on known status. */
export function transcriptVocabulary(lines: readonly TokenizedSubtitleLine[]): Map<string, Set<string>> {
  const words = new Map<string, Set<string>>();
  for (const line of lines) for (const token of line.tokens) {
    if (!token.clickable) continue;
    const japaneseIds = token.japaneseIds;
    if (japaneseIds?.length) {
      const key = japaneseIds[0]!;
      words.set(key, new Set([...(words.get(key) ?? []), ...japaneseIds]));
      continue;
    }
    const units = decomposeMorphemes(token.morphemes).filter((unit) => unit.kind === 'word' && unit.headword);
    const headwords = units.length ? units.map((unit) => unit.headword!) : token.morphemes.length ? [] : [token.text];
    const compound = units.length > 1 && units.every((unit) => unit.role === 'nominal')
      ? headwords.join('') : undefined;
    for (const raw of headwords) {
      const word = raw.trim().normalize('NFC');
      if (!/[\u1100-\u11ff\u3131-\u318e\uac00-\ud7a3]/u.test(word)) continue;
      const key = [word, ...headwordAliases(word)].sort()[0]!;
      const matches = words.get(key) ?? new Set<string>();
      matches.add(word);
      if (compound) matches.add(compound);
      words.set(key, matches);
    }
  }
  return words;
}

export function vocabularyCoverage(words: ReadonlyMap<string, ReadonlySet<string>>, known: ReadonlySet<string>) {
  const total = words.size;
  const count = [...words.values()].filter((matches) => [...matches].some((word) => known.has(word) || isKnownHeadword(word, known))).length;
  return { known: count, total, percentage: total ? (count / total * 100).toFixed(1) : null };
}
