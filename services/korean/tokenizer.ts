import type { TokenInfo } from 'kiwi-nlp';
import { decomposeMorphemes } from '@/services/korean/dictionary-forms';
import type {
  KoreanMorpheme,
  SubtitleToken,
  TokenizedSubtitleLine,
} from '@/types/messages';

const HANGUL_PATTERN = /[\u1100-\u11ff\u3131-\u318e\uac00-\ud7a3]/u;
const NON_WORD_TAGS = new Set(['SF', 'SE', 'SS', 'SP', 'SO', 'SW']);

function isClickableMorpheme(token: TokenInfo): boolean {
  return HANGUL_PATTERN.test(token.str) && !NON_WORD_TAGS.has(token.tag);
}

function toMorpheme(token: TokenInfo): KoreanMorpheme {
  return {
    text: token.str,
    tag: token.tag,
    position: token.position,
    length: token.length,
  };
}

interface SpanUnit {
  kind: 'word' | 'grammatical';
  role?: 'nominal' | 'predicate' | 'other';
  start: number;
  end: number;
  morphemes: KoreanMorpheme[];
  fused: boolean;
}

export function tokenizeSubtitleLine(
  line: string,
  morphemes: TokenInfo[],
  lineIndex: number,
): TokenizedSubtitleLine {
  const sortedMorphemes = [...morphemes].sort((a, b) => a.position - b.position);
  const tokens: SubtitleToken[] = [];
  let cursor = 0;

  let chunkMorphemes: KoreanMorpheme[] = [];
  let chunkStart = 0;
  let chunkEnd = 0;

  const addPlainText = (text: string, start: number) => {
    if (!text) return;
    tokens.push({
      id: `${lineIndex}:${start}`,
      text,
      start,
      length: text.length,
      clickable: false,
      morphemes: [],
    });
  };

  const flushChunk = () => {
    if (!chunkMorphemes.length) return;
    const currentChunk = chunkMorphemes;
    const currentStart = chunkStart;
    const currentEnd = chunkEnd;
    chunkMorphemes = [];

    addPlainText(line.slice(cursor, currentStart), cursor);

    const units = decomposeMorphemes(currentChunk);
    const spanUnits: SpanUnit[] = [];
    let pendingZeroMorphemes: KoreanMorpheme[] = [];

    for (const unit of units) {
      const start = Math.max(
        currentStart,
        Math.min(...unit.morphemes.map((morpheme) => morpheme.position)),
      );
      const end = Math.min(
        currentEnd,
        Math.max(...unit.morphemes.map((morpheme) => morpheme.position + morpheme.length)),
      );

      if (end <= start) {
        const prev = spanUnits.at(-1);
        if (prev) {
          prev.morphemes.push(...unit.morphemes);
          if (prev.kind === 'word' && unit.kind === 'word') {
            prev.fused = true;
          } else if (prev.kind === 'grammatical' && unit.kind === 'word') {
            prev.kind = 'word';
            prev.role = unit.role;
          }
        } else {
          pendingZeroMorphemes.push(...unit.morphemes);
        }
        continue;
      }

      const unitMorphemes = pendingZeroMorphemes.length
        ? [...pendingZeroMorphemes, ...unit.morphemes]
        : [...unit.morphemes];
      pendingZeroMorphemes = [];

      spanUnits.push({
        kind: unit.kind,
        role: unit.role,
        start,
        end,
        morphemes: unitMorphemes,
        fused: false,
      });
    }

    // Merge overlapping spans (e.g. fused contractions like 난, 그게, 뭔데요, 할건데).
    const merged: SpanUnit[] = [];
    for (const unit of spanUnits) {
      const prev = merged.at(-1);
      if (prev && unit.start < prev.end) {
        prev.end = Math.max(prev.end, unit.end);
        if (prev.kind === 'word' && unit.kind === 'word') {
          prev.fused = true;
        } else if (prev.kind === 'grammatical' && unit.kind === 'word') {
          prev.kind = 'word';
          prev.role = unit.role;
        }
        prev.morphemes.push(...unit.morphemes);
      } else {
        merged.push(unit);
      }
    }

    let spanCursor = currentStart;
    let index = 0;
    while (index < merged.length) {
      const unit = merged[index]!;
      if (unit.start > spanCursor) {
        addPlainText(line.slice(spanCursor, unit.start), spanCursor);
        spanCursor = unit.start;
      }

      if (unit.kind === 'grammatical') {
        const end = Math.max(spanCursor, unit.end);
        addPlainText(line.slice(spanCursor, end), spanCursor);
        spanCursor = end;
        index += 1;
        continue;
      }

      if (unit.role === 'nominal' && !unit.fused) {
        const run = [unit];
        let lookahead = index + 1;
        let runEnd = unit.end;
        while (lookahead < merged.length) {
          const next = merged[lookahead]!;
          if (next.kind === 'word' && next.role === 'nominal' && !next.fused && next.start === runEnd) {
            run.push(next);
            runEnd = next.end;
            lookahead += 1;
          } else {
            break;
          }
        }

        if (run.length >= 2) {
          const first = run[0]!;
          const last = run.at(-1)!;
          const parts: SubtitleToken[] = run.map((part) => ({
            id: `${lineIndex}:${part.start}:${part.end - part.start}`,
            text: line.slice(part.start, part.end),
            start: part.start,
            length: part.end - part.start,
            clickable: true,
            morphemes: part.morphemes,
          }));
          tokens.push({
            id: `${lineIndex}:${first.start}`,
            text: line.slice(first.start, last.end),
            start: first.start,
            length: last.end - first.start,
            clickable: true,
            morphemes: run.flatMap((part) => part.morphemes),
            parts,
          });
          spanCursor = last.end;
          index = lookahead;
          continue;
        }
      }

      const end = Math.max(spanCursor, unit.end);
      tokens.push({
        id: `${lineIndex}:${spanCursor}`,
        text: line.slice(spanCursor, end),
        start: spanCursor,
        length: end - spanCursor,
        clickable: true,
        morphemes: unit.morphemes,
      });
      spanCursor = end;
      index += 1;
    }

    if (spanCursor < currentEnd) {
      addPlainText(line.slice(spanCursor, currentEnd), spanCursor);
    }
    cursor = Math.max(cursor, currentEnd);
  };

  for (const morpheme of sortedMorphemes) {
    const end = Math.min(line.length, morpheme.position + morpheme.length);
    if (!isClickableMorpheme(morpheme)) {
      if (end <= (chunkMorphemes.length ? chunkEnd : cursor)) {
        continue;
      }
      flushChunk();
      const start = Math.max(cursor, morpheme.position);
      addPlainText(line.slice(cursor, start), cursor);
      addPlainText(line.slice(start, end), morpheme.position);
      cursor = Math.max(cursor, end);
      continue;
    }

    if (!chunkMorphemes.length) {
      const start = Math.max(cursor, morpheme.position);
      if (end <= start && morpheme.length > 0) continue;
      chunkStart = start;
      chunkEnd = Math.max(start, end);
      chunkMorphemes = [toMorpheme(morpheme)];
    } else if (morpheme.position <= chunkEnd) {
      chunkEnd = Math.max(chunkEnd, end);
      chunkMorphemes.push(toMorpheme(morpheme));
    } else {
      flushChunk();
      const start = Math.max(cursor, morpheme.position);
      chunkStart = start;
      chunkEnd = Math.max(start, end);
      chunkMorphemes = [toMorpheme(morpheme)];
    }
  }

  flushChunk();
  addPlainText(line.slice(cursor), cursor);

  return { text: line, tokens };
}
