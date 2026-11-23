import type { KoreanMorpheme, SubtitleToken } from '@/types/messages';

const PRODUCTIVE_SUFFIXES = new Set(['들', '쯤', '씩', '끼리']);
const NOMINAL_TAGS = new Set(['NNG', 'NNP', 'NNB', 'NP', 'NR']);
const PREDICATE_STEM_TAGS = new Set(['VV', 'VA', 'VX', 'VCP', 'VCN']);
const PREDICATE_DERIVATIONAL_TAGS = new Set(['XSV', 'XSA']);

const CONTRACTION_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['거', '것'],
  ['이거', '이것'],
  ['그거', '그것'],
  ['저거', '저것'],
  ['요거', '요것'],
  ['고거', '고것'],
  ['조거', '조것'],
  ['뭐', '무엇'],
  ['아무거', '아무것'],
  ['재밌다', '재미있다'],
  ['갖다', '가지다'],
  ['좀', '조금'],
  ['맘', '마음'],
  ['젤', '제일'],
  ['첨', '처음'],
  ['니', '너'],
  ['머물다', '머무르다'],
  ['서둘다', '서두르다'],
  ['서툴다', '서투르다'],
  ['딛다', '디디다'],
];

const CONTRACTION_ALIASES = new Map<string, readonly string[]>();
for (const group of CONTRACTION_ALIAS_GROUPS) {
  const normalized = group.map((entry) => entry.normalize('NFC'));
  for (const word of normalized) {
    const others = normalized.filter((other) => other !== word);
    const existing = CONTRACTION_ALIASES.get(word) ?? [];
    CONTRACTION_ALIASES.set(word, [...new Set([...existing, ...others])]);
  }
}

export interface LexicalUnit {
  kind: 'word' | 'grammatical';
  role?: 'nominal' | 'predicate' | 'other';
  morphemes: KoreanMorpheme[];
  headword?: string;
}

function baseTag(tag: string): string {
  return tag.replace(/-[IR]$/u, '');
}

function isParticleTag(tag: string): boolean {
  return tag.startsWith('J');
}

function isProductiveSuffix(morpheme: KoreanMorpheme): boolean {
  return baseTag(morpheme.tag) === 'XSN' && PRODUCTIVE_SUFFIXES.has(morpheme.text.normalize('NFC'));
}

function isWordFormingSuffix(morpheme: KoreanMorpheme): boolean {
  return baseTag(morpheme.tag) === 'XSN' && !PRODUCTIVE_SUFFIXES.has(morpheme.text.normalize('NFC'));
}

function computeUnitHeadword(unit: LexicalUnit): string | undefined {
  if (unit.kind !== 'word') return undefined;
  if (unit.role === 'predicate') {
    const stem = unit.morphemes
      .filter(({ tag }) => !tag.startsWith('E') && !tag.startsWith('J'))
      .map(({ text }) => text)
      .join('')
      .normalize('NFC');
    return stem ? `${stem}다`.normalize('NFC') : undefined;
  }
  const form = unit.morphemes.map(({ text }) => text).join('').normalize('NFC');
  return form || undefined;
}

/** Returns symmetric colloquial/standard equivalents for a headword (excluding itself). */
export function headwordAliases(headword: string): readonly string[] {
  return CONTRACTION_ALIASES.get(headword.trim().normalize('NFC')) ?? [];
}

/** Checks whether a headword or any of its colloquial contraction aliases is marked known. */
export function isKnownHeadword(headword: string, known: ReadonlySet<string>): boolean {
  const normalized = headword.trim().normalize('NFC');
  if (!normalized || !known.size) return false;
  if (known.has(normalized)) return true;
  return headwordAliases(normalized).some((alias) => known.has(alias));
}

/**
 * Splits a stream of Kiwi morphemes into lexical word units and grammatical affixes
 * across endings (`EC`, `ETM`, `ETN`, `EF`, `EP`), particles (`J*`), productive suffixes
 * (`들`, `쯤`, `씩`, `끼리`), and copula boundaries (`VCP`), while preserving prefixes
 * (`XPN`), word-forming suffixes (`XSN`), and derived predicates (`XSV`, `XSA`).
 */
export function decomposeMorphemes(morphemes: KoreanMorpheme[]): LexicalUnit[] {
  const units: LexicalUnit[] = [];
  let pendingPrefix: KoreanMorpheme[] = [];

  const flushPendingPrefix = () => {
    if (!pendingPrefix.length) return;
    units.push({ kind: 'word', role: 'other', morphemes: pendingPrefix });
    pendingPrefix = [];
  };

  for (const morpheme of morphemes) {
    const tag = baseTag(morpheme.tag);
    const prev = units.at(-1);
    const prevLastTag = prev ? baseTag(prev.morphemes.at(-1)?.tag ?? '') : '';

    if (tag === 'XPN') {
      pendingPrefix.push(morpheme);
      continue;
    }

    if (isParticleTag(morpheme.tag) || isProductiveSuffix(morpheme)) {
      flushPendingPrefix();
      units.push({ kind: 'grammatical', morphemes: [morpheme] });
      continue;
    }

    if (isWordFormingSuffix(morpheme)) {
      if (!pendingPrefix.length && prev?.kind === 'word' && (prev.role === 'nominal' || prevLastTag === 'XR')) {
        prev.morphemes.push(morpheme);
        prev.role = 'nominal';
      } else {
        const group = [...pendingPrefix, morpheme];
        pendingPrefix = [];
        units.push({ kind: 'word', role: 'nominal', morphemes: group });
      }
      continue;
    }

    if (PREDICATE_DERIVATIONAL_TAGS.has(tag)) {
      if (!pendingPrefix.length && prev?.kind === 'word' && (prev.role === 'nominal' || prevLastTag === 'XR')) {
        prev.morphemes.push(morpheme);
        prev.role = 'predicate';
      } else {
        const group = [...pendingPrefix, morpheme];
        pendingPrefix = [];
        units.push({ kind: 'word', role: 'predicate', morphemes: group });
      }
      continue;
    }

    if (morpheme.tag.startsWith('E')) {
      if (!pendingPrefix.length && prev?.kind === 'word' && prev.role === 'predicate') {
        prev.morphemes.push(morpheme);
      } else {
        flushPendingPrefix();
        units.push({ kind: 'grammatical', morphemes: [morpheme] });
      }
      continue;
    }

    const group = [...pendingPrefix, morpheme];
    pendingPrefix = [];
    if (PREDICATE_STEM_TAGS.has(tag)) {
      units.push({ kind: 'word', role: 'predicate', morphemes: group });
    } else if (NOMINAL_TAGS.has(tag)) {
      units.push({ kind: 'word', role: 'nominal', morphemes: group });
    } else {
      units.push({ kind: 'word', role: 'other', morphemes: group });
    }
  }

  flushPendingPrefix();
  for (const unit of units) {
    unit.headword = computeUnitHeadword(unit);
  }
  return units;
}

export function nominalCopulaHeadwords(morphemes: KoreanMorpheme[]) {
  const wordUnits = decomposeMorphemes(morphemes).filter((unit) => unit.kind === 'word' && unit.headword);
  const copula = wordUnits.at(-1);
  const nominals = wordUnits.slice(0, -1);
  if (
    !copula?.morphemes.some((morpheme) => baseTag(morpheme.tag) === 'VCP') ||
    !nominals.length ||
    !nominals.every((unit) => unit.role === 'nominal')
  ) {
    return undefined;
  }

  return {
    nominal: nominals.map((unit) => unit.headword!).join('').normalize('NFC'),
    copula: copula.headword!,
  };
}

function uniqueHeadwords(candidates: readonly string[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.trim().normalize('NFC')).filter(Boolean))];
}

export function dictionaryCandidates(
  word: string,
  morphemes: KoreanMorpheme[],
  known: ReadonlySet<string> = new Set(),
): string[] {
  const surface = word.trim().normalize('NFC');
  const headwords = nominalCopulaHeadwords(morphemes);
  if (headwords) {
    const { copula, nominal } = headwords;
    const nominalForms = [nominal, ...headwordAliases(nominal)];
    const ordered = isKnownHeadword(copula, known) && !isKnownHeadword(nominal, known)
      ? [...nominalForms, copula]
      : [copula, ...nominalForms];
    return uniqueHeadwords([...ordered, surface]);
  }

  const wordUnits = decomposeMorphemes(morphemes).filter((unit) => unit.kind === 'word' && unit.headword);
  if (!wordUnits.length) {
    return uniqueHeadwords([surface, ...headwordAliases(surface)]);
  }

  if (wordUnits.length > 1 && wordUnits.every((unit) => unit.role === 'nominal')) {
    const combined = wordUnits.map((unit) => unit.headword!).join('').normalize('NFC');
    return uniqueHeadwords([
      combined,
      ...headwordAliases(combined),
      surface,
      ...wordUnits.flatMap((unit) => [unit.headword!, ...headwordAliases(unit.headword!)]),
    ]);
  }

  if (wordUnits.length === 1) {
    const primary = wordUnits[0]!.headword!;
    return uniqueHeadwords([primary, ...headwordAliases(primary), surface]);
  }

  return uniqueHeadwords([
    ...wordUnits.flatMap((unit) => [unit.headword!, ...headwordAliases(unit.headword!)]),
    surface,
  ]);
}

export function isKnownSubtitleWord(token: SubtitleToken, known: ReadonlySet<string>): boolean {
  if (token.japaneseIds) return token.japaneseIds.some((id) => known.has(id));
  if (!known.size) return false;

  const wordUnits = decomposeMorphemes(token.morphemes).filter((unit) => unit.kind === 'word' && unit.headword);
  if (!wordUnits.length) {
    return isKnownHeadword(token.text, known);
  }

  if (wordUnits.length > 1 && wordUnits.every((unit) => unit.role === 'nominal')) {
    const combined = wordUnits.map((unit) => unit.headword!).join('').normalize('NFC');
    if (isKnownHeadword(combined, known)) return true;
  }

  return wordUnits.every((unit) => isKnownHeadword(unit.headword!, known));
}

/**
 * Expands unspaced compound-noun tokens into their constituent clickable sub-tokens
 * whenever the compound as a whole is not in `knownHeadwords`.
 */
export function resolveRenderTokens(
  tokens: readonly SubtitleToken[],
  knownHeadwords?: ReadonlySet<string>,
): SubtitleToken[] {
  const resolved: SubtitleToken[] = [];
  for (const token of tokens) {
    if (token.clickable && token.parts?.length) {
      const wordUnits = decomposeMorphemes(token.morphemes).filter((unit) => unit.kind === 'word' && unit.headword);
      const wholeHeadword = wordUnits.length
        ? wordUnits.map((unit) => unit.headword!).join('').normalize('NFC')
        : token.text.normalize('NFC');
      if (knownHeadwords && isKnownHeadword(wholeHeadword, knownHeadwords)) {
        resolved.push(token);
      } else {
        resolved.push(...token.parts);
      }
    } else {
      resolved.push(token);
    }
  }
  return resolved;
}
