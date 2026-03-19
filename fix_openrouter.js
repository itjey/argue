const fs = require('fs');
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

// 1. Replace the URLs and add the routing logic
const oldUrls = `const OPENROUTER_MODELS_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/models'
const OPENROUTER_CHAT_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions'`;

const newUrls = `const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROXY_MODELS_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/models'
const PROXY_CHAT_URL = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions'

let workingApiBase: 'direct' | 'proxy' | null = null;
let baseTestPromise: Promise<'direct' | 'proxy'> | null = null;

async function getWorkingApiBase(): Promise<'direct' | 'proxy'> {
  if (workingApiBase) return workingApiBase;
  if (!baseTestPromise) {
    const testUrl = async (url: string, type: 'direct' | 'proxy') => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'HTTP-Referer': getAppOrigin() } });
        clearTimeout(id);
        if (res.ok) return type;
        throw new Error('Not ok');
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };
    baseTestPromise = Promise.any([
      testUrl(OPENROUTER_MODELS_URL, 'direct'),
      testUrl(PROXY_MODELS_URL, 'proxy')
    ]).catch(() => 'direct' as const); // fallback to direct if both timeout
  }
  workingApiBase = await baseTestPromise;
  return workingApiBase;
}`;

code = code.replace(oldUrls, newUrls);

// 2. Modify fetchOpenRouterModels (return bundled instantly, trigger test background)
const oldFetchModels = `async function fetchOpenRouterModels() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)

    const response = await fetch(OPENROUTER_MODELS_URL, {
      signal: controller.signal,
      headers: requestHeaders(),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error('OpenRouter model catalog could not be loaded right now.')
    }

    const payload = (await response.json()) as OpenRouterModelsResponse
    const models = (payload.data ?? [])
      .filter((model): model is OpenRouterModel => Boolean(model?.id))
      .map((model) => normalizeOpenRouterModel(model))

    if (models.length > 0) {
      return models.sort((left, right) => left.name.localeCompare(right.name))
    }
  } catch (error) {
    console.warn('[OpenRouter] Falling back to bundled model catalog.', error)
  }

  return getBundledOpenRouterModels()
}`;

const newFetchModels = `async function fetchOpenRouterModels() {
  // Fire off the API reachability test in the background so chat doesn't lag later
  getWorkingApiBase().catch(() => {});

  // Return bundled models INSTANTLY to remove the 3.5s loading delay for the user
  return getBundledOpenRouterModels();
}`;

code = code.replace(oldFetchModels, newFetchModels);

// 3. Modify createOpenRouterChatCompletion
const oldChatCompletion = `async function createOpenRouterChatCompletion({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionOptions) {
  let response = await fetch(OPENROUTER_CHAT_URL, {`;

const newChatCompletion = `async function createOpenRouterChatCompletion({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionOptions) {
  const apiBase = await getWorkingApiBase();
  const chatUrl = apiBase === 'proxy' ? PROXY_CHAT_URL : OPENROUTER_CHAT_URL;

  let response = await fetch(chatUrl, {`;

code = code.replace(oldChatCompletion, newChatCompletion);

// 4. Modify createOpenRouterChatCompletionStream
const oldChatStream = `async function createOpenRouterChatCompletionStream({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  onProgress,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionStreamOptions) {
  let response = await fetch(OPENROUTER_CHAT_URL, {`;

const newChatStream = `async function createOpenRouterChatCompletionStream({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  onProgress,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionStreamOptions) {
  const apiBase = await getWorkingApiBase();
  const chatUrl = apiBase === 'proxy' ? PROXY_CHAT_URL : OPENROUTER_CHAT_URL;

  let response = await fetch(chatUrl, {`;

code = code.replace(oldChatStream, newChatStream);

fs.writeFileSync('src/lib/openrouter.ts', code);
console.log('Done!');
