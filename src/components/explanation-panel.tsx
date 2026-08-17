'use client';

import { useMemo } from 'react';

import { segmentSource } from '@/lib/annotate';
import type { PartialExplanation } from '@/lib/schema';

/**
 * Renders blank-line-separated model prose as real paragraphs, with a blinking
 * caret on the last one while text is still arriving.
 */
function Paragraphs({ text, caret }: { text: string; caret?: boolean }) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className={caret && i === paras.length - 1 ? 'caret' : undefined}>
          {p}
        </p>
      ))}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
      {children}
    </h3>
  );
}

function Skeletons() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="skeleton h-6 w-4/5" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-11/12" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}

interface Props {
  data: PartialExplanation;
  source: string;
  streaming: boolean;
  focus?: string;
  onAsk: (question: string) => void;
  onHighlightTerm: (index: number) => void;
}

export function ExplanationPanel({
  data,
  source,
  streaming,
  focus,
  onAsk,
  onHighlightTerm,
}: Props) {
  const jargon = useMemo(() => data.jargon ?? [], [data.jargon]);

  // Terms the model claimed but that aren't actually in the source get labelled,
  // rather than silently presented as though they were highlighted.
  const matched = useMemo(
    () => segmentSource(source, jargon.map((t) => t.term ?? '')).matched,
    [source, jargon],
  );

  if (!data.gist && !data.approach) return <Skeletons />;

  return (
    <div className="space-y-9">
      {focus && (
        <p className="rise rounded-lg border border-rule bg-paper-sunken px-3.5 py-2.5 text-[0.8125rem] text-ink-muted">
          Answering: <span className="font-medium text-ink">{focus}</span>
        </p>
      )}

      {/* ── Gist ── */}
      {data.gist ? (
        <section className="rise">
          <SectionLabel>In one sentence</SectionLabel>
          <p className="prose-plain text-[1.3125rem] leading-snug font-medium text-ink">
            {data.gist}
          </p>
        </section>
      ) : (
        <Skeletons />
      )}

      {/* ── Plain rewrite ── */}
      {data.plainText && (
        <section className="rise">
          <SectionLabel>In plain English</SectionLabel>
          <div className="prose-plain text-[1.0625rem] text-ink">
            <Paragraphs text={data.plainText} caret={streaming} />
          </div>
        </section>
      )}

      {/* ── Analogy ── */}
      {data.analogy?.headline && (
        <section className="rise rounded-lg border-l-2 border-accent bg-paper-sunken py-4 pr-4 pl-5">
          <SectionLabel>Think of it this way</SectionLabel>
          <p className="prose-plain text-[1.0625rem] font-semibold text-accent">
            {data.analogy.headline}
          </p>
          {data.analogy.body && (
            <p className="prose-plain mt-1.5 text-[0.9375rem] text-ink">
              {data.analogy.body}
            </p>
          )}
        </section>
      )}

      {/* ── Key points ── */}
      {data.keyPoints && data.keyPoints.length > 0 && (
        <section className="rise">
          <SectionLabel>What matters</SectionLabel>
          <ul className="space-y-3.5">
            {data.keyPoints.map((kp, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                <span>
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {kp.point}
                  </span>
                  {kp.detail && (
                    <span className="prose-plain mt-0.5 block text-[0.9375rem] text-ink-muted">
                      {kp.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Glossary ── */}
      {jargon.length > 0 && (
        <section className="rise">
          <SectionLabel>Jargon decoded</SectionLabel>
          <dl className="divide-y divide-rule border-y border-rule">
            {jargon.map((t, i) => (
              <div key={i} className="py-3">
                <dt>
                  {matched.has(i) ? (
                    <button
                      type="button"
                      onClick={() => onHighlightTerm(i)}
                      className="text-[0.9375rem] font-semibold text-accent underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    >
                      {t.term}
                    </button>
                  ) : (
                    <span className="text-[0.9375rem] font-semibold text-ink">
                      {t.term}
                      <span className="ml-2 align-middle text-[0.6875rem] font-normal tracking-wide text-ink-faint uppercase">
                        not in your text
                      </span>
                    </span>
                  )}
                </dt>
                {t.plain && (
                  <dd className="prose-plain mt-1 text-[0.9375rem] text-ink-muted">
                    {t.plain}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── Ask next ── */}
      {data.questions && data.questions.length > 0 && (
        <section className="rise">
          <SectionLabel>Ask next</SectionLabel>
          <div className="flex flex-col items-start gap-2">
            {data.questions.filter(Boolean).map((q, i) => (
              <button
                key={i}
                type="button"
                disabled={streaming}
                onClick={() => onAsk(q)}
                className="rounded-lg border border-rule px-3.5 py-2 text-left text-[0.875rem] text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Caveat ── */}
      {data.caveat && (
        <p className="rise text-[0.8125rem] leading-relaxed text-ink-faint italic">
          <span className="not-italic">⚠ </span>
          {data.caveat}
        </p>
      )}

      {/* ── Reasoning: a real schema field, not a prompt-tag illusion ── */}
      {data.approach && (
        <details className="rise border-t border-rule pt-4">
          <summary className="flex items-center gap-2 text-xs tracking-wide text-ink-faint uppercase hover:text-ink-muted">
            <svg
              className="disclosure-arrow h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            How I read this
          </summary>
          <p className="prose-plain mt-3 text-[0.875rem] text-ink-muted italic">
            {data.approach}
          </p>
        </details>
      )}
    </div>
  );
}
