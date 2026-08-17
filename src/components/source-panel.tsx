'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { segmentSource } from '@/lib/annotate';
import type { JargonTerm } from '@/lib/schema';

interface Props {
  text: string;
  terms: Array<Partial<JargonTerm>>;
  /** Set by the glossary to draw attention to a term inside the source. */
  flashTerm: number | null;
}

export function SourcePanel({ text, terms, flashTerm }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const termStrings = useMemo(() => terms.map((t) => t.term ?? ''), [terms]);
  const { segments } = useMemo(
    () => segmentSource(text, termStrings),
    [text, termStrings],
  );

  // Dismiss the popover on Escape or a click outside it.
  useEffect(() => {
    if (open === null) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(null);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // Scroll a glossary-selected term into view.
  useEffect(() => {
    if (flashTerm === null) return;
    containerRef.current
      ?.querySelector(`[data-term-index="${flashTerm}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [flashTerm]);

  return (
    <div ref={containerRef} className="relative">
      <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
        Your text
      </h2>

      <p className="text-[0.9375rem] leading-[1.85] whitespace-pre-wrap text-ink-muted">
        {segments.map((seg, i) => {
          if (seg.kind === 'text') return <span key={i}>{seg.text}</span>;

          const term = terms[seg.termIndex];
          const isOpen = open === seg.termIndex;

          return (
            <span key={i} className="relative inline">
              <button
                type="button"
                data-term-index={seg.termIndex}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : seg.termIndex)}
                className={`term-mark${flashTerm === seg.termIndex ? ' is-flashing' : ''}`}
              >
                {seg.text}
              </button>

              {isOpen && term && (
                <span
                  role="dialog"
                  aria-label={`Definition of ${term.term}`}
                  className="rise absolute top-[calc(100%+0.5rem)] left-0 z-20 block w-[min(19rem,78vw)] rounded-lg border border-rule-strong bg-paper-raised p-3.5 text-left shadow-lg"
                >
                  <span className="block text-sm font-semibold text-accent">
                    {term.term}
                  </span>
                  {term.plain && (
                    <span className="mt-1.5 block text-[0.8125rem] leading-relaxed text-ink">
                      {term.plain}
                    </span>
                  )}
                  {term.inContext && (
                    <span className="mt-2 block border-t border-rule pt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
                      <span className="font-medium text-ink-faint">Here: </span>
                      {term.inContext}
                    </span>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </p>

      {termStrings.some(Boolean) && (
        <p className="mt-4 text-xs text-ink-faint">
          Underlined words are explained — tap one.
        </p>
      )}
    </div>
  );
}
