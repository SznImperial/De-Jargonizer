'use client';

import { useSyncExternalStore } from 'react';

type Choice = 'light' | 'dark' | 'system';

const KEY = 'dj-theme';
const EVENT = 'dj-theme-change';

/**
 * localStorage is an external store, so it's read through useSyncExternalStore
 * rather than a mount effect — that keeps hydration correct without writing
 * state from an effect.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function getSnapshot(): Choice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

const getServerSnapshot = (): Choice => 'system';

const ICONS: Record<Choice, string> = {
  light:
    'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2v3m0-20v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  dark: 'M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  system: 'M4 5h16v10H4zM8 19h8M12 15v4',
};

const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' };

const LABEL: Record<Choice, string> = {
  system: 'Theme: following your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function cycle() {
    const next = NEXT[choice];
    const root = document.documentElement;

    if (next === 'system') {
      root.removeAttribute('data-theme');
      localStorage.removeItem(KEY);
    } else {
      root.setAttribute('data-theme', next);
      localStorage.setItem(KEY, next);
    }

    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABEL[choice]}
      aria-label={`${LABEL[choice]}. Activate to change.`}
      className="rounded-full border border-rule p-2 text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={ICONS[choice]} />
      </svg>
    </button>
  );
}
