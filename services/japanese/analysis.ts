import type { DictionaryEntry, SubtitleToken, TokenizedSubtitleLine } from '@/types/messages';
import { readJapaneseDictionary } from './dictionary-store';
import { matchJapaneseWord, normalizeJapanese, type JapaneseMatch } from './jmdict';

interface Candidate { form: string; pos?: string }
interface Rule { suffix: string; ending: string; pos: string }
const rules: Rule[] = [];
let segmenter: Intl.Segmenter | undefined;
const japaneseText = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u;
const grammar = new Set('は が を に へ と も で の や か ね よ ぞ さ だ です ます ない た から まで'.split(' '));

function endings(pos: string, ending: string, stem: string, suffixes: string) {
  for (const suffix of suffixes.split(' ')) rules.push({ suffix: stem + suffix, ending, pos });
}

function verb(pos: string, ending: string, negative: string, polite: string, past: string, te: string) {
  endings(pos, ending, negative, 'ない なかった なくて なければ');
  if (pos !== 'v1') endings(pos, ending, negative, 'せる せた せない れる れた れない');
  endings(pos, ending, polite, 'ます ました ません ませんでした ましょう たい たかった');
  endings(pos, ending, '', past);
  endings(pos, ending, te, ' いる いた いない いなかった います いました ます ました る た ない しまう しまった');
  if (te === 'って' || te === 'て' || te === 'いて' || te === 'して') {
    endings(pos, ending, te.slice(0, -1), 'ちゃう ちゃった');
  } else {
    endings(pos, ending, te.slice(0, -1), 'じゃう じゃった');
  }
}

verb('v1', 'る', '', '', 'た', 'て');
endings('v1', 'る', '', 'られる られた られない られなかった られます られました させる させた させられる させられました');
verb('v5u', 'う', 'わ', 'い', 'った', 'って');
verb('v5k', 'く', 'か', 'き', 'いた', 'いて');
verb('v5k-s', 'く', 'か', 'き', 'った', 'って');
verb('v5g', 'ぐ', 'が', 'ぎ', 'いだ', 'いで');
verb('v5s', 'す', 'さ', 'し', 'した', 'して');
verb('v5t', 'つ', 'た', 'ち', 'った', 'って');
verb('v5n', 'ぬ', 'な', 'に', 'んだ', 'んで');
verb('v5b', 'ぶ', 'ば', 'び', 'んだ', 'んで');
verb('v5m', 'む', 'ま', 'み', 'んだ', 'んで');
verb('v5r', 'る', 'ら', 'り', 'った', 'って');
endings('adj-i', 'い', '', 'かった くない くなかった くて ければ');
endings('vs', 'する', 'し', 'た て ない なかった ます ました ません ている ていた');
endings('vs', 'する', 'さ', 'れる れた れない せる せた せられる せられました');
endings('vk', '来る', '来', 'ない なかった た て ます ました ません られる');
endings('vk', 'くる', 'こ', 'ない なかった られる');
endings('vk', 'くる', 'き', 'た て ます ました ません');

const rulesByLastKana = new Map<string, Rule[]>();
for (const rule of rules) {
  const last = rule.suffix.at(-1)!;
  const list = rulesByLastKana.get(last) ?? [];
  list.push(rule);
  rulesByLastKana.set(last, list);
}

function candidates(text: string): Candidate[] {
  const form = normalizeJapanese(text);
  if (!japaneseText.test(form)) return [];
  const result: Candidate[] = [{ form }];
  for (const rule of rulesByLastKana.get(form.at(-1)!) ?? []) {
    if (!form.endsWith(rule.suffix)) continue;
    const stem = form.slice(0, -rule.suffix.length);
    if (stem || rule.pos === 'vs' || rule.pos === 'vk') result.push({ form: stem + normalizeJapanese(rule.ending), pos: rule.pos });
  }
  return result;
}

type Dictionary = Awaited<ReturnType<typeof readJapaneseDictionary>>;
type ReadDictionary = (forms: readonly string[]) => Promise<Dictionary>;

function matches(options: Candidate[], dictionary: Dictionary): JapaneseMatch[] {
  const found = new Map<string, JapaneseMatch>();
  for (const { form, pos } of options) {
    for (const word of dictionary.get(form)) {
      for (const match of matchJapaneseWord(word, form, dictionary.labels)) {
        if (pos && !match.pos.some((tag) => tag === pos || (pos === 'vs' && tag.startsWith('vs-')) ||
          (pos === 'v1' && tag === 'v1-s'))) continue;
        const id = match.entry.japanese!.id;
        if (!found.has(id)) found.set(id, match);
      }
    }
    if (!pos && found.size) break;
  }
  return [...found.values()].sort((a, b) => Number(b.common) - Number(a.common));
}

export async function lookupJapaneseWord(text: string, read: ReadDictionary = readJapaneseDictionary): Promise<DictionaryEntry[]> {
  if (text.length > 100) throw new Error('Choose a shorter Japanese word.');
  const options = candidates(text);
  if (!options.length) return [];
  const dictionary = await read([...new Set(options.map(({ form }) => form))]);
  return matches(options, dictionary).slice(0, 20).map(({ entry }) => ({ ...entry, originalForm: text }));
}

interface Window { end: number; options: Candidate[] }
interface LinePlan { text: string; segments: Intl.SegmentData[]; windows: Window[][] }

function planLine(text: string): LinePlan {
  segmenter ??= new Intl.Segmenter('ja', { granularity: 'word' });
  const segments = [...segmenter.segment(text)];
  const windows = segments.map(({ index, isWordLike, segment }, start) => {
    if (!isWordLike || !japaneseText.test(segment)) return [];
    const result: Window[] = [];
    for (let end = start; end < Math.min(start + 8, segments.length); end += 1) {
      const next = segments[end]!;
      if (!next.isWordLike || !japaneseText.test(next.segment)) break;
      const surface = text.slice(index, next.index + next.segment.length);
      if (surface.length > 24 && end !== start) break;
      result.push({ end, options: candidates(surface) });
    }
    return result.reverse();
  });
  return { text, segments, windows };
}

function renderLine(plan: LinePlan, line: number, dictionary: Dictionary): TokenizedSubtitleLine {
  const { text, segments, windows } = plan;
  const tokens: SubtitleToken[] = [];
  for (let index = 0; index < segments.length;) {
    const segment = segments[index]!;
    let end = index;
    let identities: string[] = [];
    for (const window of windows[index]!) {
      const options = matches(window.options, dictionary).filter(({ pos }) => !pos.some((tag) => tag === 'prt' || tag === 'aux'));
      if (!options.length || (window.end === index && grammar.has(normalizeJapanese(segment.segment)))) continue;
      end = window.end;
      identities = options.map(({ entry }) => entry.japanese!.id).slice(0, 20);
      break;
    }
    const start = segment.index;
    const last = segments[end]!;
    const length = last.index + last.segment.length - start;
    tokens.push({ id: `${line}:${start}`, text: text.slice(start, start + length), start, length, morphemes: [],
      clickable: identities.length > 0, ...(identities.length ? { japaneseIds: identities } : {}) });
    index = end + 1;
  }
  return { text, tokens };
}

export async function tokenizeJapaneseLines(lines: string[], read: ReadDictionary = readJapaneseDictionary): Promise<TokenizedSubtitleLine[]> {
  if (lines.length > 50 || lines.some((line) => line.length > 2_000) ||
    lines.reduce((length, line) => length + line.length, 0) > 12_000) throw new Error('The Japanese text batch is too large.');
  const plans = lines.map(planLine);
  const forms = new Set<string>();
  for (const { windows } of plans) {
    for (const choices of windows) {
      for (const { options } of choices) for (const { form } of options) forms.add(form);
    }
  }
  const dictionary = await read([...forms]);
  return plans.map((plan, index) => renderLine(plan, index, dictionary));
}
