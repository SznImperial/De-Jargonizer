import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Providers retire model names on their own schedule, so this is a starting
 * point, not a promise. `npm run models` lists what your key can actually reach;
 * set LLM_MODEL in .env.local to pin one.
 */
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

export const MODEL_ID = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
export const BASE_URL = process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'No API key configured. Add GROQ_API_KEY to .env.local — get one free at https://console.groq.com/keys',
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Groq by default, but any OpenAI-compatible endpoint works via LLM_BASE_URL +
 * LLM_MODEL, so the provider can be swapped without touching the app.
 *
 * Note: `supportsStructuredOutputs` is deliberately left off. The provider then
 * sends `response_format: { type: 'json_object' }`, which every OpenAI-compatible
 * model supports, rather than the strict `json_schema` mode only some accept. The
 * AI SDK does not inject the schema into the prompt in this mode, which is why the
 * JSON contract is spelled out by hand in `prompt.ts`.
 */
export function explainerModel() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  const provider = createOpenAICompatible({
    name: 'groq',
    baseURL: BASE_URL,
    apiKey,
  });

  return provider.chatModel(MODEL_ID);
}
