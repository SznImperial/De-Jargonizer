// Throwaway verification for src/lib/annotate.ts — not part of the app.
// Run: node --experimental-strip-types scripts/check-annotate.mts
import { segmentSource } from '../src/lib/annotate.ts';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

/** Compact view: marked terms as <<text>>, plain text as-is. */
function render(text: string, terms: string[]) {
  return segmentSource(text, terms)
    .segments.map((s) => (s.kind === 'term' ? `<<${s.text}>>` : s.text))
    .join('');
}

console.log('segmentSource');

// Longest term wins when spans collide.
check(
  'prefers the longer overlapping term',
  render('Quantum entanglement is odd.', ['entanglement', 'Quantum entanglement']),
  '<<Quantum entanglement>> is odd.',
);

// Every occurrence is marked, not just the first.
check(
  'marks repeated occurrences',
  render('A qubit is a qubit.', ['qubit']),
  'A <<qubit>> is a <<qubit>>.',
);

// Case-insensitive matching, original casing preserved in output.
check(
  'matches case-insensitively and preserves source casing',
  render('Entanglement and entanglement.', ['ENTANGLEMENT']),
  '<<Entanglement>> and <<entanglement>>.',
);

// Word boundaries: must not match inside a longer word.
check(
  'does not match inside a longer word',
  render('This region is important.', ['ion']),
  'This region is important.',
);

check(
  'still matches a standalone word at a boundary',
  render('An ion moves.', ['ion']),
  'An <<ion>> moves.',
);

// Hallucinated / absent terms are reported as unmatched.
const absent = segmentSource('Plain sentence here.', ['entanglement', 'Plain']);
check('reports only located terms as matched', [...absent.matched], [1]);

// Sub-threshold and blank terms are ignored ("go" is 2 chars, below the floor).
check(
  'ignores terms shorter than 3 chars and blanks',
  render('It is a go.', ['a', '', '  ', 'go']),
  'It is a go.',
);

// ...but exactly 3 chars is accepted, pinning the boundary from the other side.
check(
  'accepts a 3-character term',
  render('The gap is big.', ['gap']),
  'The <<gap>> is big.',
);

// Partial terms mid-stream (model still writing the field) must not crash.
check('handles an empty term list', render('Nothing to mark.', []), 'Nothing to mark.');
check('handles empty text', render('', ['term']), '');

// Duplicate terms in the model output collapse to one highlight pass.
check(
  'deduplicates repeated terms case-insensitively',
  render('The qubit spins.', ['qubit', 'Qubit']),
  'The <<qubit>> spins.',
);

// Hyphenated / multi-word terms.
check(
  'matches multi-word and punctuated terms',
  render('Uses rate-control therapy now.', ['rate-control therapy']),
  'Uses <<rate-control therapy>> now.',
);

// Term indices must survive the longest-first sort.
const idx = segmentSource('alpha beta', ['beta', 'alpha']);
check(
  'keeps term indices aligned after sorting',
  idx.segments.filter((s) => s.kind === 'term').map((s) => (s as { termIndex: number }).termIndex),
  [1, 0],
);

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
