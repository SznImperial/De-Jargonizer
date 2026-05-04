/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/preserve-manual-memoization */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { readStreamableValue } from '@ai-sdk/rsc';
import { simplify } from './actions';

// ──────────────────────────────────────────────
// Thought-tag parser: splits streaming text into
// reasoning (<|thought|>…<|thought|>) and visible output
// ──────────────────────────────────────────────
function parseThoughtTags(raw: string): { thinking: string; visible: string } {
  // Match both <|thought|>...<|thought|> and <|thought|>...</|thought|>
  const regex = /<\|thought\|>([\s\S]*?)(?:<\/\|thought\|>|<\|thought\|>)/g;
  const thoughts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    thoughts.push(match[1].trim());
  }

  const visible = raw.replace(/<\|thought\|>[\s\S]*?(?:<\/\|thought\|>|<\|thought\|>)/g, '').trim();

  // Handle unclosed thought tag (still streaming)
  const openIdx = visible.lastIndexOf('<|thought|>');
  let cleanVisible = visible;
  let pendingThought = '';

  if (openIdx !== -1) {
    pendingThought = visible.slice(openIdx + '<|thought|>'.length);
    cleanVisible = visible.slice(0, openIdx).trim();
    thoughts.push(pendingThought);
  }

  return {
    thinking: thoughts.join('\n\n'),
    visible: cleanVisible,
  };
}

// ──────────────────────────────────────────────
// Very minimal Markdown renderer (no deps)
// ──────────────────────────────────────────────
function renderMarkdown(text: string): string {
  if (!text) return '';

  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-t border-slate-700 my-4" />')
    // Line breaks (double newline → paragraph)
    .replace(/\n\n/g, '</p><p>')
    // Single line breaks
    .replace(/\n/g, '<br />');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Don't wrap headers in paragraphs
  html = html.replace(/<p>(<h[23]>)/g, '$1');
  html = html.replace(/(<\/h[23]>)<\/p>/g, '$1');
  // Don't wrap blockquotes in paragraphs
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  // Don't wrap hrs in paragraphs
  html = html.replace(/<p>(<hr[^>]*\/>)/g, '$1');
  html = html.replace(/(<hr[^>]*\/>)<\/p>/g, '$1');

  // Handle unordered lists (- item)
  html = html.replace(
    /(?:<br \/>)?- (.+?)(?=<br \/>|- |<\/p>|$)/g,
    '<li>$1</li>'
  );
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Collapse consecutive lists
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  // Don't wrap lists in paragraphs
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');

  return html;
}

// ──────────────────────────────────────────────
// Section parser: splits visible output into tabs
// ──────────────────────────────────────────────
interface KeyTerm { term: string; definition: string; }
interface BlueprintPoint { title: string; details: string[]; }
interface ParsedSections {
  intuition: string;
  blueprint: BlueprintPoint[];
  keyTerms: KeyTerm[];
  raw: string;
}

function parseSections(text: string): ParsedSections {
  const result: ParsedSections = { intuition: '', blueprint: [], keyTerms: [], raw: text };
  if (!text) return result;

  // Split by ## headers
  const intuitionMatch = text.match(/##\s*The Intuition\s*\n([\s\S]*?)(?=##|$)/i);
  const blueprintMatch = text.match(/##\s*The Blueprint\s*\n([\s\S]*?)(?=##|$)/i);

  if (intuitionMatch) result.intuition = intuitionMatch[1].trim();

  if (blueprintMatch) {
    const bpText = blueprintMatch[1].trim();
    // Parse top-level bullet points (* **Term**: ...)
    const lines = bpText.split('\n');
    let current: BlueprintPoint | null = null;

    for (const line of lines) {
      const topMatch = line.match(/^\*\s+\*\*(.+?)\*\*[:\s]*(.*)/);
      if (topMatch) {
        if (current) result.blueprint.push(current);
        current = { title: topMatch[1], details: topMatch[2] ? [topMatch[2]] : [] };
        // Also extract as key term
        if (topMatch[2]) result.keyTerms.push({ term: topMatch[1], definition: topMatch[2] });
      } else if (current) {
        const subMatch = line.match(/^\s+\+\s+\*\*(.+?)\*\*[:\s]*(.*)/);
        if (subMatch) {
          current.details.push(`**${subMatch[1]}**: ${subMatch[2]}`);
          result.keyTerms.push({ term: subMatch[1], definition: subMatch[2] });
        } else if (line.trim()) {
          current.details.push(line.trim());
        }
      }
    }
    if (current) result.blueprint.push(current);
  }

  return result;
}

// ──────────────────────────────────────────────
// Character counter max
// ──────────────────────────────────────────────
const MAX_CHARS = 5000;
type TabId = 'intuition' | 'blueprint' | 'terms';

// Blueprint card icon set (inline SVG paths)
const CARD_ICONS = [
  'M13 10V3L4 14h7v7l9-11h-7z', // lightning
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z', // check-circle
  'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z', // cog
  'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z', // shield
  'M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z', // plane
  'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z', // palette
];

export default function Home() {
  const [input, setInput] = useState<string>('');
  const [rawOutput, setRawOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isThinkingOpen, setIsThinkingOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabId>('intuition');
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const { thinking, visible } = parseThoughtTags(rawOutput);
  const sections = parseSections(visible);

  // Auto-scroll output into view
  useEffect(() => {
    if (visible && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visible]);

  // Auto-switch to the tab currently being streamed
  useEffect(() => {
    if (!isLoading) return;
    if (sections.blueprint.length > 0) setActiveTab('blueprint');
    else if (sections.intuition) setActiveTab('intuition');
  }, [isLoading, sections.intuition, sections.blueprint.length]);

  const handleCopy = useCallback(async () => {
    if (!visible) return;
    await navigator.clipboard.writeText(visible);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [visible]);

  const handleSimplify = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setRawOutput('');
    setIsThinkingOpen(false);

    try {
      const result = await simplify(input.trim());

      // Server Action returns { error } instead of throwing
      if (result.error) {
        setError(result.error);
        return;
      }

      for await (const delta of readStreamableValue(result.output!)) {
        if (delta) {
          setRawOutput((prev) => prev + delta);
        }
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSimplify();
      }
    },
    [handleSimplify]
  );

  const charCount = input.length;
  const isOverLimit = charCount > MAX_CHARS;

  return (
    <div className="flex flex-1 flex-col items-center">
      {/* ═══ Ambient Background Glow ═══ */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-[0.04]"
          style={{
            background:
              'radial-gradient(circle, #fbbf24 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -right-40 top-1/3 h-[400px] w-[400px] rounded-full opacity-[0.03]"
          style={{
            background:
              'radial-gradient(circle, #f97316 0%, transparent 70%)',
          }}
        />
      </div>

      <main className="relative z-10 flex w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        {/* ═══ Header ═══ */}
        <header className="mb-10 text-center sm:mb-12">
          <h1 className="text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            <span className="font-extralight">De-</span>
            <span className="font-bold bg-linear-to-r from-gold to-orange bg-clip-text text-transparent">Jargonizer</span>
          </h1>

          <p className="mt-3 text-sm text-slate-400 sm:text-base">
            Instant clarity for complex ideas.
          </p>

          <div
            className="mx-auto mt-4 h-px w-24 sm:w-32"
            style={{
              background:
                'linear-gradient(90deg, transparent, #fbbf24, transparent)',
            }}
          />
        </header>

        {/* ═══ Input Section ═══ */}
        <section className="mb-6" aria-label="Input">
          <label
            htmlFor="complexity-input"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Paste your complex text
          </label>
          <textarea
            id="complexity-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. &quot;Quantum entanglement is a phenomenon in which particles become interconnected and the quantum state of each particle cannot be described independently...&quot;"
            rows={6}
            maxLength={MAX_CHARS + 500}
            className="imperial-textarea w-full rounded-xl p-4 text-sm leading-relaxed sm:text-base"
            disabled={isLoading}
            aria-describedby="char-counter"
          />
          <div
            id="char-counter"
            className="mt-1.5 flex items-center justify-between text-xs"
          >
            <span className="text-slate-500">
              Ctrl+Enter to submit
            </span>
            <span
              className={
                isOverLimit
                  ? 'font-medium text-red-400'
                  : 'text-slate-500'
              }
            >
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
        </section>

        {/* ═══ De-Jargonize Button ═══ */}
        <button
          id="dejargonize-btn"
          onClick={handleSimplify}
          disabled={isLoading || !input.trim() || isOverLimit}
          className="btn-gold mx-auto flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold uppercase tracking-wider sm:h-14 sm:max-w-xs sm:text-base"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
              <span>De-Jargonizing…</span>
            </>
          ) : (
            <>
              {/* Sparkle icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" fill="currentColor" />
              </svg>
              <span>De-Jargonize</span>
            </>
          )}
        </button>

        {/* ═══ Error Display ═══ */}
        {error && (
          <div
            className="error-card animate-fade-in-up mt-6 rounded-xl p-4 text-sm"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                  fill="currentColor"
                />
              </svg>
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="mt-1 opacity-80">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Loading Shimmer ═══ */}
        {isLoading && !rawOutput && (
          <div className="mt-8 space-y-3" aria-label="Loading">
            <div className="animate-shimmer h-4 w-3/4 rounded" />
            <div className="animate-shimmer h-4 w-full rounded" style={{ animationDelay: '0.2s' }} />
            <div className="animate-shimmer h-4 w-5/6 rounded" style={{ animationDelay: '0.4s' }} />
            <div className="animate-shimmer h-4 w-2/3 rounded" style={{ animationDelay: '0.6s' }} />
          </div>
        )}

        {/* ═══ Output Section ═══ */}
        {(visible || thinking) && (
          <div className="mt-8 space-y-4 animate-fade-in-up" ref={outputRef}>
            {/* Reasoning Accordion */}
            {thinking && (
              <details
                open={isThinkingOpen}
                onToggle={(e) =>
                  setIsThinkingOpen((e.target as HTMLDetailsElement).open)
                }
                className="glass-reasoning rounded-xl"
              >
                <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 select-none">
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 2a9 9 0 0 0-9 9c0 3.07 1.53 5.78 3.87 7.41A2 2 0 0 1 8 20.21V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.79c0-.72.37-1.38.97-1.76A9 9 0 0 0 12 2zm0 2a7 7 0 0 1 4.3 12.54A4 4 0 0 0 14 20.21V21h-4v-.79a4 4 0 0 0-2.3-3.67A7 7 0 0 1 12 4z" fill="currentColor" />
                    </svg>
                    <span className="text-sm font-medium text-slate-400">Reasoning Process</span>
                    {isLoading && <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />}
                  </div>
                  <svg className="accordion-chevron h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="accordion-content border-t border-slate-700/50 px-5 py-4">
                  <p className="whitespace-pre-wrap font-mono text-xs italic leading-relaxed text-slate-500 sm:text-sm">
                    {thinking}
                  </p>
                </div>
              </details>
            )}

            {/* Main Output Container */}
            {visible && (
              <div className="glass-card rounded-xl overflow-hidden">
                {/* Header with copy button */}
                <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-gold" />
                    <span className="text-xs font-semibold tracking-[0.15em] uppercase text-gold/70">
                      Simplified Output
                    </span>
                    {isLoading && <span className="ml-2 text-xs text-slate-500">streaming…</span>}
                  </div>
                  <button onClick={handleCopy} className={`copy-btn ${copied ? 'copied' : ''}`}>
                    {copied ? (
                      <>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor"/></svg>
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Tab Bar */}
                <div className="tab-bar mt-4 mx-5 sm:mx-6">
                  {([
                    { id: 'intuition' as TabId, label: 'The Intuition', icon: 'M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z' },
                    { id: 'blueprint' as TabId, label: 'The Blueprint', icon: 'M22 9V7h-2V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zM18 19H4V5h14v14zM6 13h5v4H6v-4zm6-6h4v3h-4V7zM6 7h5v5H6V7zm6 4h4v6h-4v-6z' },
                    { id: 'terms' as TabId, label: 'Key Terms', icon: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d={tab.icon} fill="currentColor" />
                      </svg>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.label.replace('The ', '')}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="p-5 sm:p-6" key={activeTab}>
                  {/* ── Intuition Tab ── */}
                  {activeTab === 'intuition' && (
                    <div className="animate-slide-up">
                      {sections.intuition ? (
                        <div className="section-card">
                          <div className="mb-3 flex items-center gap-2">
                            <svg className="h-5 w-5 text-gold" viewBox="0 0 24 24" fill="none"><path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z" fill="currentColor"/></svg>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-gold">The Intuition</h3>
                          </div>
                          <div className="markdown-output" dangerouslySetInnerHTML={{ __html: renderMarkdown(sections.intuition) }} />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">Waiting for the analogy…</p>
                      )}
                    </div>
                  )}

                  {/* ── Blueprint Tab ── */}
                  {activeTab === 'blueprint' && (
                    <div className="animate-slide-up">
                      {sections.blueprint.length > 0 ? (
                        <div className="space-y-3 animate-stagger">
                          {sections.blueprint.map((point, i) => (
                            <div key={i} className="blueprint-card">
                              <div className="mb-2 flex items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)' }}>
                                  <svg className="h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none"><path d={CARD_ICONS[i % CARD_ICONS.length]} fill="currentColor"/></svg>
                                </div>
                                <h4 className="text-sm font-semibold text-gold-bright">{point.title}</h4>
                              </div>
                              {point.details.length > 0 && (
                                <ul className="ml-10 space-y-1">
                                  {point.details.map((d, j) => (
                                    <li key={j} className="text-sm leading-relaxed text-slate-300">
                                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(d) }} />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">Waiting for the technical breakdown…</p>
                      )}
                    </div>
                  )}

                  {/* ── Key Terms Tab ── */}
                  {activeTab === 'terms' && (
                    <div className="animate-slide-up">
                      {sections.keyTerms.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
                          {sections.keyTerms.map((kt, i) => (
                            <div key={i} className="term-card">
                              <p className="text-sm font-semibold text-gold-bright">{kt.term}</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-400">{kt.definition}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">Key terms will appear once the blueprint is generated…</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ Footer ═══ */}
        <footer className="mt-auto pt-12 pb-6 text-center">
          <p className="text-xs text-slate-600">
            Powered by{' '}
            <span className="font-medium text-slate-500">Llama 3.3</span>{' '}
            via Groq
          </p>
          <p className="mt-1 text-[10px] text-slate-700">
            Built by <span className="text-gold/30">Adetola Abdulkareem Ayinde</span>
          </p>
          <p className="mt-0.5 text-[10px] text-slate-700">
            © {new Date().getFullYear()} Imp3rial4tw. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
