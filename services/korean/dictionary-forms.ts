import type { KoreanMorpheme, SubtitleToken } from '@/types/messages';

export function dictionaryCandidates(word: string, morphemes: KoreanMorpheme[]): string[] {
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
