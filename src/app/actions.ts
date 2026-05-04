/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import OpenAI from 'openai';
import { createStreamableValue } from '@ai-sdk/rsc';

const SYSTEM_PROMPT = `You are the De-Jargonizer, an expert at making complex ideas feel simple. Your task is to take dense, jargon-heavy text and break it down into two clear sections:

**The Intuition:** A plain-language explanation using a relatable, everyday analogy. Make it vivid and memorable — the kind of explanation that makes someone say "Oh, THAT's what that means!" Avoid technical terms entirely in this section.

**The Blueprint:** A structured technical breakdown that's easy to follow. Use bullet points with bold key terms, and define every technical word inline the first time you use it. Organize the information logically so a curious beginner could follow along.

Wrap your internal reasoning inside <|thought|> tags before producing your final answer. Your reasoning should show how you chose the analogy and how you structured the breakdown.

Format your final output (outside the thought tags) using clean Markdown with headers (##), bold, and bullet points for readability.`;

// Return type: either a stream or an error string — never throw
interface SimplifySuccess {
  output: ReturnType<typeof createStreamableValue>['value'];
  error?: undefined;
}

interface SimplifyError {
  output?: undefined;
  error: string;
}

type SimplifyResult = SimplifySuccess | SimplifyError;

export async function simplify(input: string): Promise<SimplifyResult> {
  // Guard: validate input
  if (!input || input.trim().length === 0) {
    return { error: 'Please provide some text to simplify.' };
  }

  if (input.trim().length < 10) {
    return {
      error:
        'Please provide a longer text (at least 10 characters) for meaningful simplification.',
    };
  }

  // Guard: validate API key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      error:
        'Groq API key is not configured. Please add your API key to the .env.local file. ' +
        'Get one at https://console.groq.com/',
    };
  }

  const stream = createStreamableValue('');

  // Run the streaming in a background async context
  (async () => {
    try {
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input },
        ],
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 4096,
        stream: true,
      };

      const completion = await client.chat.completions.create(payload as any) as any;

      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          stream.update(content);
        }
      }

      stream.done();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };

      if (err.status === 401 || err.status === 400) {
        stream.error(
          new Error('Invalid API key. Please check your GROQ_API_KEY in .env.local.')
        );
      } else if (err.status === 429) {
        stream.error(
          new Error('Rate limit exceeded. Please wait a moment and try again.')
        );
      } else if (err.status && err.status >= 500) {
        stream.error(
          new Error('Groq API is temporarily unavailable. Please try again later.')
        );
      } else {
        stream.error(
          new Error(
            err.message || 'An unexpected error occurred while processing your request.'
          )
        );
      }
    }
  })();

  return { output: stream.value };
}
