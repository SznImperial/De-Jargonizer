import type { Metadata } from 'next';
import { Geist, Newsreader } from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

// The reading serif. Plain-English prose is set in this; UI chrome stays sans.
const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'De-Jargonizer — read anything',
  description:
    'Paste dense, jargon-heavy text. Get the jargon annotated in place and a plain-English explanation at whatever depth you need.',
  keywords: [
    'jargon',
    'plain language',
    'explainer',
    'reading',
    'comprehension',
    'AI',
    'simplify',
  ],
  authors: [{ name: 'The Imperialists' }],
  openGraph: {
    title: 'De-Jargonizer — read anything',
    description:
      'Jargon annotated in place, plus a plain-English explanation at the depth you choose.',
    type: 'website',
  },
};

/**
 * Applied before first paint so a dark-mode reader never sees a white flash.
 * Mirrors the CSS fallback: no attribute means "follow the system".
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('dj-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${newsreader.variable} h-full`}
    >
      <head>
        <meta name="ory-verify" content="orynth-bf6698a51756421ea591a94953565d91" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
