'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Composer } from '@/components/composer';
import { ExplanationPanel } from '@/components/explanation-panel';
import { LevelDial } from '@/components/level-dial';
import { SourcePanel } from '@/components/source-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { useExplainer } from '@/hooks/use-explainer';
import type { Level } from '@/lib/schema';

export default function Home() {
  const [level, setLevel] = useState<Level>('curious');
  const [flashTerm, setFlashTerm] = useState<number | null>(null);
  const { data, status, error, source, focus, run, reset } = useExplainer();

  const resultRef = useRef<HTMLDivElement>(null);
  const streaming = status === 'streaming';
  const hasResult = status !== 'idle';

  const start = useCallback(
    (text: string) => {
      void run({ text, level });
    },
    [run, level],
  );

  // Changing the dial re-explains the same text at the new depth. Definitions
  // are regenerated too, which is the point — a 10-year-old and a practitioner
  // need different definitions of the same term.
  const changeLevel = useCallback(
    (next: Level) => {
      setLevel(next);
      if (source) void run({ text: source, level: next, focus });
    },
    [run, source, focus],
  );

  const ask = useCallback(
    (question: string) => {
      if (source) void run({ text: source, level, focus: question });
    },
    [run, source, level],
  );

  const highlightTerm = useCallback((index: number) => {
    setFlashTerm(index);
    window.setTimeout(() => setFlashTerm(null), 1200);
  }, []);

  // Bring the result into view once the first request starts.
  useEffect(() => {
    if (streaming && !data) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [streaming, data]);

  return (
    <div className="flex flex-1 flex-col">
      {/* ═══ Header ═══ */}
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
              De<span className="text-accent">·</span>Jargonizer
            </h1>
            <p className="hidden text-xs text-ink-faint sm:block">
              read anything
            </p>
          </div>

          <div className="flex items-center gap-3">
            <LevelDial value={level} onChange={changeLevel} disabled={streaming} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        {/* ═══ Composer ═══ */}
        <div className="mx-auto max-w-2xl">
          <Composer onSubmit={start} busy={streaming} />
        </div>

        {/* ═══ Status for screen readers ═══ */}
        <p aria-live="polite" className="sr-only">
          {streaming
            ? 'Reading your text and writing an explanation.'
            : status === 'done'
              ? 'Explanation ready.'
              : ''}
        </p>

        {/* ═══ Error ═══ */}
        {status === 'error' && error && (
          <div
            role="alert"
            className="rise mx-auto mt-8 max-w-2xl rounded-lg border border-danger bg-danger-soft p-4"
          >
            <p className="text-sm font-medium text-danger">{error}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Start over
            </button>
          </div>
        )}

        {/* ═══ Result: source on the left, plain English on the right ═══ */}
        {hasResult && status !== 'error' && (
          <div
            ref={resultRef}
            className="mt-12 grid gap-10 border-t border-rule pt-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-14"
          >
            <div className="lg:sticky lg:top-8 lg:self-start">
              <SourcePanel
                text={source}
                terms={data?.jargon ?? []}
                flashTerm={flashTerm}
              />
            </div>

            <div>
              <h2 className="mb-6 flex items-center gap-2.5 text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
                In plain English
                {streaming && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                )}
              </h2>
              <ExplanationPanel
                data={data ?? {}}
                source={source}
                streaming={streaming}
                focus={focus}
                onAsk={ask}
                onHighlightTerm={highlightTerm}
              />
            </div>
          </div>
        )}
      </main>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-5 py-6 text-center sm:px-8">
          <p className="text-xs text-ink-faint">
            Built by Adetola Abdulkareem Ayinde · © {new Date().getFullYear()} Imp3rial4tw
          </p>
        </div>
      </footer>
    </div>
  );
}
