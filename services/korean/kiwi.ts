import { KiwiBuilder, type Kiwi, type TokenInfo } from 'kiwi-nlp';
import { browser } from 'wxt/browser';
import { tokenizeSubtitleLine } from '@/services/korean/tokenizer';
import type { TokenizedSubtitleLine } from '@/types/messages';

const MODEL_FILES = [
  'combiningRule.txt',
  'cong.mdl',
  'default.dict',
  'dialect.dict',
  'extract.mdl',
  'multi.dict',
  'nounchr.mdl',
  'sj.morph',
  'typo.dict',
] as const;

let kiwiPromise: Promise<Kiwi> | null = null;

function getAssetUrl(path: string): string {
  type RuntimePath = Parameters<typeof browser.runtime.getURL>[0];
  return browser.runtime.getURL(path as RuntimePath);
}

async function createKiwi(): Promise<Kiwi> {
  const builder = await KiwiBuilder.create(getAssetUrl('kiwi-nlp/kiwi-wasm.wasm'));
  const modelFiles = Object.fromEntries(
    MODEL_FILES.map((file) => [file, getAssetUrl(`kiwi-models/${file}`)]),
  );

  return builder.build({
    modelFiles,
    modelType: 'cong',
    integrateAllomorph: true,
  });
}

function getKiwi(): Promise<Kiwi> {
  kiwiPromise ??= createKiwi().catch((error: unknown) => {
    kiwiPromise = null;
    throw error;
  });

  return kiwiPromise;
}

export async function tokenizeSubtitleLines(lines: string[]): Promise<TokenizedSubtitleLine[]> {
  const kiwi = await getKiwi();

  return lines.map((line, lineIndex) => {
    const result = kiwi.tokenize(line);
    return tokenizeSubtitleLine(line, result as TokenInfo[], lineIndex);
  });
}
