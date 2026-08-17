# De-Jargonizer

You are staring at a paragraph you don't understand — a clinical note, a licence
clause, an abstract, a whitepaper. De-Jargonizer makes it clear without making it
vaguer.

Two things happen at once:

- **The jargon is annotated where you met it.** Your text stays on screen with the
  hard words underlined. Tap one to get what it means in general, and what it
  means *right here* in this passage.
- **You set the depth.** One dial — *Like I'm 10* / *Curious adult* /
  *Adjacent field* — regenerates the whole explanation, definitions included,
  because a ten-year-old and a practitioner need different definitions of the
  same word.

Then: a one-sentence gist, the passage rewritten plainly, an analogy (and where
it breaks down), what matters, a glossary, and three questions worth asking next
— click one and the explanation is re-aimed at answering it.

## Run it

```bash
cp .env.example .env.local   # add your GROQ_API_KEY
npm install
npm run dev
```

A free Groq key comes from <https://console.groq.com/keys>.

| Variable | Required | Default |
| --- | --- | --- |
| `GROQ_API_KEY` | yes | — |
| `LLM_BASE_URL` | no | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | no | `openai/gpt-oss-20b` |

Any OpenAI-compatible endpoint works — set both optional variables.

Providers retire model names periodically. If you see *"the model isn't available
to your API key"*, run `npm run models` to list what your key can actually reach
and pin one with `LLM_MODEL`.

## Checks

```bash
npm run check:annotate   # unit checks for the jargon matcher (Node >=22.6)
npm run models           # what your API key can reach
npx tsc --noEmit
npm run lint
```

## How it's built

```
Composer + LevelDial
      │  POST /api/explain  { text, level, focus? }
      ▼
route.ts ─ zod-validated ─ streamText({ output: Output.object({ explanationSchema }) })
      │  .toTextStreamResponse()          → raw JSON deltas
      ▼
use-explainer ─ accumulate ─ parsePartialJson ─ render (coalesced to ~60ms)
      │
      ├─► SourcePanel      segmentSource(text, terms) → clickable marks
      └─► ExplanationPanel each section appears as its field arrives
```

A few decisions worth knowing about:

**The UI never parses prose.** The model returns a typed object
(`src/lib/schema.ts`), so each section renders from a field rather than from a
regex hunting for `## headers`. Nothing is injected as HTML.

**Key order in the schema is load-bearing.** The model emits keys in the order
they're described, and the client paints each field on arrival — so the order is
tuned for perceived speed: `approach` → `subject` → `gist` → `jargon` (the
highlights light up) → `plainText` → `analogy` → `keyPoints` → `questions` →
`caveat`.

**The JSON contract lives in the prompt, deliberately.**
`@ai-sdk/openai-compatible` sends `response_format: {type:'json_object'}` but
does *not* inject the schema into the prompt, and `llama-3.3-70b-versatile`
doesn't support Groq's strict `json_schema` mode. So `Output.object` is used to
switch on JSON mode, while the field-by-field contract is spelled out in
`src/lib/prompt.ts`. This keeps the app working on any OpenAI-compatible model.

**Term matching trusts nothing.** The model is told to copy jargon verbatim from
the source, but `src/lib/annotate.ts` still matches case-insensitively, respects
word boundaries (`ion` never matches inside `region`), prefers the longest term
when spans collide, and reports terms it couldn't find — the glossary labels
those *"not in your text"* rather than pretending they were highlighted.

**Results are memoised per `(text, level, focus)`**, so flipping back to a depth
you've already seen is instant.

### Upstream failures

`streamText` is lazy, so the route awaits the **first chunk** before returning a
response. That way an immediate provider failure — rejected key, retired model
name, rate limit — still becomes a real status code and an actionable message,
rather than a committed `200` that dies silently mid-body. Only failures *after*
the first chunk are unrecoverable at the HTTP level; those are logged, and the
client (which knows whether it ever received a `gist`) offers a retry.
