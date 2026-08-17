'use client';

import { useRef, useState } from 'react';

import { MAX_CHARS, MIN_CHARS } from '@/lib/schema';

const SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'A physics abstract',
    text: 'Quantum entanglement is a physical phenomenon that occurs when a group of particles is generated, interacts, or shares spatial proximity in such a way that the quantum state of each particle of the group cannot be described independently of the state of the others, including when the particles are separated by a large distance. Measurements of physical properties such as position, momentum, spin, and polarization performed on entangled particles can, in some cases, be found to be perfectly correlated.',
  },
  {
    label: 'A software licence',
    text: 'Subject to Licensee\'s continuing compliance with the terms hereof, Licensor grants Licensee a non-exclusive, non-transferable, revocable licence to use the Software solely for Licensee\'s internal business purposes. Licensee shall not, directly or indirectly, reverse engineer, decompile, disassemble or otherwise attempt to derive the source code, object code or underlying structure, ideas or algorithms of the Software, except to the extent such restriction is expressly prohibited by applicable law.',
  },
  {
    label: 'A medical note',
    text: 'The patient presents with paroxysmal atrial fibrillation with rapid ventricular response, currently rate-controlled on a beta-blocker. Echocardiography demonstrates preserved left ventricular ejection fraction with mild concentric hypertrophy and grade I diastolic dysfunction. Anticoagulation was initiated following CHA2DS2-VASc risk stratification; no evidence of intracardiac thrombus on transoesophageal imaging.',
  },
];

interface Props {
  onSubmit: (text: string) => void;
  busy: boolean;
}

export function Composer({ onSubmit, busy }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const count = text.length;
  const tooLong = count > MAX_CHARS;
  const tooShort = count > 0 && text.trim().length < MIN_CHARS;
  const canSubmit = !busy && !tooLong && text.trim().length >= MIN_CHARS;

  function submit() {
    if (canSubmit) onSubmit(text.trim());
  }

  function applySample(sample: string) {
    setText(sample);
    ref.current?.focus();
  }

  return (
    <section aria-label="Your text">
      <label htmlFor="source-text" className="mb-2 block text-sm font-medium text-ink">
        What are you trying to read?
      </label>

      <textarea
        id="source-text"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={7}
        disabled={busy}
        aria-describedby="composer-meta"
        placeholder="Paste the paragraph that isn't making sense — an abstract, a contract clause, a doctor's note, a whitepaper…"
        className="w-full resize-y rounded-lg border border-rule bg-paper-raised p-4 text-[0.9375rem] leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-60"
      />

      <div
        id="composer-meta"
        className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <span className="text-ink-faint">
          {tooShort
            ? `At least ${MIN_CHARS} characters, please`
            : 'Ctrl or ⌘ + Enter to run'}
        </span>
        <span className={tooLong ? 'font-medium text-danger' : 'text-ink-faint'}>
          {count.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-on transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? 'Reading…' : 'De-jargonize'}
        </button>

        {!text && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-faint">or try</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => applySample(s.text)}
                className="rounded-full border border-rule px-3 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
