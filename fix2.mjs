import fs from 'fs';
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

code = code.replace(
  "const OPENROUTER_MODELS_URL = 'https://app.gphmt.org/api/v1/models'\nconst OPENROUTER_CHAT_URL = 'https://app.gphmt.org/api/v1/chat/completions'",
  "const OPENROUTER_MODELS_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/models'\nconst OPENROUTER_CHAT_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions'"
);

fs.writeFileSync('src/lib/openrouter.ts', code);
