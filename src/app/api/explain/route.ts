import { APICallError, Output, streamText } from 'ai';

import { explainerModel, MissingApiKeyError, MODEL_ID } from '@/lib/model';
import { systemPrompt, userPrompt } from '@/lib/prompt';
import { explanationSchema, MAX_CHARS, MIN_CHARS, requestSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Turns provider failures into something a reader can act on. */
function describe(error: unknown): { message: string; status: number } {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 502;
    const body = String(error.responseBody ?? '');

    if (status === 404 || body.includes('model_not_found')) {
      return {
        status: 502,
        message: `The model "${MODEL_ID}" isn't available to your API key — providers retire model names periodically. Run "npm run models" to list what your key can reach, then set LLM_MODEL in .env.local.`,
      };
    }
    if (status === 401 || status === 403) {
      return {
        status: 502,
        message: 'Your API key was rejected. Check GROQ_API_KEY in .env.local.',
      };
    }
    if (status === 429) {
      return {
        status: 429,
        message: 'Rate limit reached. Wait a moment and try again.',
      };
    }
    if (status >= 500) {
      return {
        status: 502,
        message: 'The model provider is temporarily unavailable. Try again shortly.',
      };
    }
    return { status: 502, message: error.message };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Could not read the request.', 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const tooShort = parsed.error.issues.some(
      (i) => i.path[0] === 'text' && i.code === 'too_small',
    );
    return fail(
      tooShort
        ? `Give me at least ${MIN_CHARS} characters to work with.`
        : `That text is too long — keep it under ${MAX_CHARS.toLocaleString()} characters.`,
      400,
    );
  }

  const { text, level, focus } = parsed.data;

  let model;
  try {
    model = explainerModel();
  } catch (error) {
    if (error instanceof MissingApiKeyError) return fail(error.message, 500);
    throw error;
  }

  const result = streamText({
    model,
    system: systemPrompt(level, focus),
    prompt: userPrompt(text),
    output: Output.object({ schema: explanationSchema }),
    temperature: 0.6,
    maxOutputTokens: 3000,
  });

  // `streamText` is lazy: the upstream request hasn't happened yet. Awaiting the
  // FIRST chunk here means an immediate failure (bad key, retired model, rate
  // limit) still becomes a real status code and an actionable message, instead of
  // a committed 200 that dies silently mid-body.
  const reader = result.textStream.getReader();
  let firstRead: ReadableStreamReadResult<string> | null = null;
  try {
    firstRead = await reader.read();
  } catch (error) {
    console.error('[explain] upstream call failed:', error);
    const { message, status } = describe(error);
    void reader.cancel().catch(() => {});
    return fail(message, status);
  }

  // Copied into plain consts so the stream closure below captures values rather
  // than a possibly-unassigned binding.
  const firstChunk = firstRead.value;
  const firstDone = firstRead.done;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (firstChunk) controller.enqueue(encoder.encode(firstChunk));
        if (firstDone) {
          controller.close();
          return;
        }
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(encoder.encode(value));
        }
        controller.close();
      } catch (error) {
        // Past this point the status is already sent, so the client detects a
        // stream that ended without a gist and offers a retry.
        console.error('[explain] stream failed mid-body:', error);
        controller.error(error);
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
