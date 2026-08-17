// Lists the chat models your API key can actually reach.
// Run: npm run models
//
// Providers retire model names periodically, so this is the authoritative answer
// for what to put in LLM_MODEL — no guessing from docs.
import { readFileSync } from 'node:fs';

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const file of ['.env.local', '.env']) {
    try {
      const line = readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.trim().startsWith(`${name}=`));
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    } catch {
      // file absent — try the next one
    }
  }
  return undefined;
}

const key = readEnv('GROQ_API_KEY');
const baseURL = readEnv('LLM_BASE_URL') ?? 'https://api.groq.com/openai/v1';

if (!key) {
  console.error('No GROQ_API_KEY found in .env.local or the environment.');
  process.exit(1);
}

const res = await fetch(`${baseURL}/models`, {
  headers: { Authorization: `Bearer ${key}` },
});

if (!res.ok) {
  console.error(`${res.status} ${res.statusText}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(1);
}

const { data } = await res.json();
const ids = (data ?? [])
  .filter((m) => m.active !== false)
  .map((m) => m.id)
  .sort();

console.log(`${ids.length} models available at ${baseURL}:\n`);
for (const id of ids) console.log(`  ${id}`);
console.log('\nPin one by adding to .env.local:\n  LLM_MODEL=<id>');
