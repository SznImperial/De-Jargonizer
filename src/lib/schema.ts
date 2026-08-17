import { z } from 'zod';

/**
 * Reading levels. The dial value is sent with every request and changes the
 * voice of *everything* — including the jargon definitions, since a 10-year-old
 * and a practitioner need different definitions of the same term.
 */
export const LEVELS = ['kid', 'curious', 'practitioner'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  kid: "Like I'm 10",
  curious: 'Curious adult',
  practitioner: 'Adjacent field',
};

export const MIN_CHARS = 20;
export const MAX_CHARS = 5000;

/**
 * KEY ORDER IS LOAD-BEARING.
 *
 * The model emits JSON keys in the order they are described, and the client
 * renders each field the moment it arrives. So this order is tuned for
 * perceived speed: a short `approach` gives the reader something immediately,
 * `gist` lands the payoff early, and `jargon` comes before the long prose so
 * the source-text highlights light up while the rest is still streaming.
 */
export const explanationSchema = z.object({
  /** Short planning note, surfaced in the "How I read this" disclosure. */
  approach: z.string(),
  /** 2-5 word label for what the passage is about. */
  subject: z.string(),
  /** The single most important takeaway, one sentence. */
  gist: z.string(),
  /** Jargon found in the source. `term` must be a verbatim source substring. */
  jargon: z.array(
    z.object({
      term: z.string(),
      plain: z.string(),
      inContext: z.string(),
    }),
  ),
  /** The passage itself, rewritten at the requested level. */
  plainText: z.string(),
  analogy: z.object({
    headline: z.string(),
    body: z.string(),
  }),
  keyPoints: z.array(
    z.object({
      point: z.string(),
      detail: z.string(),
    }),
  ),
  /** Three questions worth asking next. */
  questions: z.array(z.string()),
  /** Anything oversimplified or uncertain. Null when there is nothing to flag. */
  caveat: z.string().nullable(),
});

export type Explanation = z.infer<typeof explanationSchema>;
export type JargonTerm = Explanation['jargon'][number];
export type KeyPoint = Explanation['keyPoints'][number];

/**
 * What the client actually holds mid-stream: every field may be absent, and the
 * field currently being generated is usually a truncated fragment. Written by
 * hand rather than derived so the streaming contract is readable.
 */
export type PartialExplanation = {
  approach?: string;
  subject?: string;
  gist?: string;
  jargon?: Array<Partial<JargonTerm>>;
  plainText?: string;
  analogy?: Partial<Explanation['analogy']>;
  keyPoints?: Array<Partial<KeyPoint>>;
  questions?: string[];
  caveat?: string | null;
};

export const requestSchema = z.object({
  text: z.string().min(MIN_CHARS).max(MAX_CHARS),
  level: z.enum(LEVELS),
  /** Set when the reader clicks an "Ask next" question. */
  focus: z.string().max(300).optional(),
});

export type ExplainRequest = z.infer<typeof requestSchema>;
