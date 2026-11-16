interface DefinitionTranslator {
  translate(text: string, options: { signal: AbortSignal }): Promise<string>;
  destroy(): void;
}

export const getDefinitionTranslatorApi = () => (globalThis as typeof globalThis & {
  Translator?: {
    create(options: {
      sourceLanguage: string;
      targetLanguage: string;
      signal: AbortSignal;
    }): Promise<DefinitionTranslator>;
  };
}).Translator;

export function createDefinitionTranslator(signal: AbortSignal) {
  const definitionTranslatorApi = getDefinitionTranslatorApi();
  if (!definitionTranslatorApi) throw new Error('Chrome on-device translation is unavailable.');
  return definitionTranslatorApi.create({ sourceLanguage: 'ko', targetLanguage: 'en', signal });
}

export async function translateDefinitionList(
  translator: DefinitionTranslator,
  definitions: string[],
  signal: AbortSignal,
): Promise<string[]> {
  const results: string[] = [];
  for (const definition of definitions) {
    signal.throwIfAborted();
    results.push((await translator.translate(definition, { signal })).trim());
  }
  if (results.some((result) => !result)) throw new Error('Empty translation');
  return results;
}
