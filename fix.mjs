import fs from 'fs';
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

code = code.replace(
  /const OPENROUTER_MODELS_URL = '[^']+';?\nconst OPENROUTER_CHAT_URL = '[^']+';?/g,
  `const OPENROUTER_ENDPOINTS = [
  'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1',
  'https://openrouter.ai/api/v1'
]`
);

code = code.replace(
  /async function fetchOpenRouterModels\(\) \{[\s\S]*?catch \(error\) \{[\s\S]*?\}[\s\S]*?return getBundledOpenRouterModels\(\)\n\}/,
`async function fetchOpenRouterModels() {
  for (const endpoint of OPENROUTER_ENDPOINTS) {
    try {
      const response = await fetch(\`\${endpoint}/models\`, {
        headers: requestHeaders(),
      })
      if (response.ok) {
        const payload = await response.json()
        const models = (payload.data ?? [])
          .filter((model) => Boolean(model?.id))
          .map((model) => normalizeOpenRouterModel(model))
        if (models.length > 0) {
          return models.sort((left, right) => left.name.localeCompare(right.name))
        }
      }
    } catch (error) {
      console.warn(\`[OpenRouter] \${endpoint} failed\`, error)
    }
  }
  console.warn('[OpenRouter] Falling back to bundled model catalog.')
  return getBundledOpenRouterModels()
}`
);

// We need to replace fetch(OPENROUTER_CHAT_URL to loop
code = code.replace(
  /const response = await fetch\(OPENROUTER_CHAT_URL/g,
  "throw new Error('replaced')"
);

fs.writeFileSync('src/lib/openrouter.ts', code);
