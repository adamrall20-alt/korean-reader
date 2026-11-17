import type { KoreanMorpheme, SubtitleToken } from '@/types/messages';

export function nominalCopulaHeadwords(morphemes: KoreanMorpheme[]) {
  const lexicalMorphemes = morphemes.filter(({ tag }) => !tag.startsWith('E'));
  const copula = lexicalMorphemes.at(-1);
  const nominal = lexicalMorphemes.slice(0, -1);
  if (copula?.tag !== 'VCP' || !nominal.length ||
    !nominal.every(({ tag }) => /^(NN|NP|NR)/u.test(tag))) return undefined;

  return {
    nominal: nominal.map(({ text }) => text).join('').normalize('NFC'),
    copula: `${copula.text}다`.normalize('NFC'),
  };
}

export function dictionaryCandidates(
  word: string,
  morphemes: KoreanMorpheme[],
  known: ReadonlySet<string> = new Set(),
): string[] {
  const headwords = nominalCopulaHeadwords(morphemes);
  if (headwords) {
    const { copula, nominal } = headwords;
    const ordered = known.has(copula) && !known.has(nominal)
      ? [nominal, copula]
      : [copula, nominal];
    return [...new Set([...ordered, word.trim().normalize('NFC')])];
  }

  const lexicalMorphemes = morphemes.filter((morpheme) =>
    /^(NN|NP|NR|VV|VA|VX|VCP|VCN|XR|XSV|XSA)/u.test(morpheme.tag),
  );
  const lexicalForm = lexicalMorphemes.map((morpheme) => morpheme.text).join('');
  const hasPredicate = lexicalMorphemes.some((morpheme) =>
    /^(VV|VA|VX|VCP|VCN|XSV|XSA)/u.test(morpheme.tag),
  );
  const dictionaryForm = hasPredicate && lexicalForm.length > 0 ? `${lexicalForm}다` : '';
  const candidates = [
    dictionaryForm,
    word,
    ...morphemes
      .filter((morpheme) => /^(VV|VA|VX|VCP|VCN)/u.test(morpheme.tag))
      .map((morpheme) => `${morpheme.text}다`),
    ...morphemes
      .filter((morpheme) => /^(NN|NP|NR|MAG|XR)/u.test(morpheme.tag))
      .map((morpheme) => morpheme.text),
  ];

  return [...new Set(candidates.map((candidate) => candidate.trim().normalize('NFC')).filter(Boolean))];
}

export function isKnownSubtitleWord(token: SubtitleToken, known: ReadonlySet<string>): boolean {
  if (!known.size) return false;

  const headwords = nominalCopulaHeadwords(token.morphemes);
  if (headwords) return known.has(headwords.nominal) && known.has(headwords.copula);

  const surface = token.text.normalize('NFC');
  const [preferredForm] = dictionaryCandidates(surface, token.morphemes);

  // A conjugated verb can have the same spelling as an unrelated noun.
  if (preferredForm && preferredForm !== surface) return known.has(preferredForm);
  if (known.has(surface)) return true;

  // A noun or pronoun with a particle still refers to the same headword.
  const withoutParticles = token.morphemes.filter(({ tag }) => !tag.startsWith('J'));
  return withoutParticles.length === 1 &&
    /^(NN|NP|NR)/u.test(withoutParticles[0]!.tag) &&
    known.has(withoutParticles[0]!.text.normalize('NFC'));
}
