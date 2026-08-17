/**
 * Maps the model's jargon terms back onto the reader's original text so they can
 * be highlighted in place.
 *
 * The model is told to copy terms verbatim, but it is a language model, so this
 * module assumes nothing: matching is case-insensitive, respects word
 * boundaries, and reports which terms it could not find.
 */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'term'; text: string; termIndex: number };

export interface Annotation {
  segments: Segment[];
  /** Indices into the original `terms` array that were located in the text. */
  matched: Set<number>;
}

const MIN_TERM_LENGTH = 3;

/**
 * True when `ch` would make a match part of a larger word.
 *
 * Avoids `\p{L}` regex escapes, which need an ES2018 target (this project's
 * tsconfig targets ES2017). The case comparison identifies letters in any
 * bicameral script — Latin, Greek, Cyrillic. Scripts without case (CJK, Arabic)
 * read as non-word, which is the behaviour we want anyway: they don't delimit
 * words with spaces, so a strict boundary test would block every match.
 */
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  if (ch >= '0' && ch <= '9') return true;
  return ch.toLowerCase() !== ch.toUpperCase();
}

export function segmentSource(text: string, terms: readonly string[]): Annotation {
  const matched = new Set<number>();
  if (!text) return { segments: [], matched };

  // Keep the first occurrence of each distinct term; drop blanks and stopword-length noise.
  const seen = new Set<string>();
  const candidates: Array<{ term: string; termIndex: number }> = [];
  terms.forEach((raw, termIndex) => {
    const term = raw?.trim();
    if (!term || term.length < MIN_TERM_LENGTH) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ term, termIndex });
  });

  // Longest first, so "quantum entanglement" claims its span before "entanglement" can.
  candidates.sort((a, b) => b.term.length - a.term.length);

  const haystack = text.toLowerCase();
  const claimed: Array<{ start: number; end: number; termIndex: number }> = [];

  const overlaps = (start: number, end: number) =>
    claimed.some((r) => start < r.end && end > r.start);

  for (const { term, termIndex } of candidates) {
    const needle = term.toLowerCase();
    let from = 0;

    for (;;) {
      const start = haystack.indexOf(needle, from);
      if (start === -1) break;
      const end = start + needle.length;
      from = start + 1;

      // Reject matches sitting inside a longer word ("ion" within "region").
      if (isWordChar(text[start - 1]) || isWordChar(text[end])) continue;
      if (overlaps(start, end)) continue;

      claimed.push({ start, end, termIndex });
      matched.add(termIndex);
    }
  }

  claimed.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of claimed) {
    if (range.start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, range.start) });
    }
    segments.push({
      kind: 'term',
      text: text.slice(range.start, range.end),
      termIndex: range.termIndex,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }

  return { segments, matched };
}
