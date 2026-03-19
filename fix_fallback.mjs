import fs from 'fs';
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

// First replace the constants
code = code.replace(
  "const OPENROUTER_MODELS_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/models'\nconst OPENROUTER_CHAT_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions'",
  `const OPENROUTER_MODELS_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/models'
const OPENROUTER_CHAT_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions'
const FALLBACK_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'`
);

// We need to implement a simple fallback fetcher.
code = code.replace(
  /const response = await fetch\(OPENROUTER_CHAT_URL, \{/g,
  `let response = await fetch(OPENROUTER_CHAT_URL, {`
);

code = code.replace(
  /export async function createOpenRouterChatCompletion\(\{/g,
  `export async function createOpenRouterChatCompletion({`
);

fs.writeFileSync('src/lib/openrouter.ts', code);
