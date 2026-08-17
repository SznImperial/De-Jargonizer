'use client';

import { LEVEL_LABELS, LEVELS, type Level } from '@/lib/schema';

interface Props {
  value: Level;
  onChange: (level: Level) => void;
  disabled?: boolean;
}

export function LevelDial({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        id="level-dial-label"
        className="text-xs tracking-wide text-ink-faint uppercase"
      >
        Explain it like
      </span>
      <div className="dial" role="radiogroup" aria-labelledby="level-dial-label">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            disabled={disabled}
            onClick={() => onChange(level)}
            className="dial-option"
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}
