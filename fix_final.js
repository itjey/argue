const fs = require('fs');
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

// 1. Fix getWorkingApiBase
const baseOld = `async function getWorkingApiBase(): Promise<'direct' | 'proxy'> {
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

const baseNew = `async function getWorkingApiBase(): Promise<'direct' | 'proxy'> {
  if (workingApiBase) return workingApiBase;
  if (!baseTestPromise) {
    const testUrl = async (url: string, type: 'direct' | 'proxy') => {
      const controller = new AbortController();
      // Increase timeout because school networks can be slow and drop packets
      const id = setTimeout(() => controller.abort(), 4000); 
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
      testUrl(PROXY_MODELS_URL, 'proxy'), // test proxy first
      testUrl(OPENROUTER_MODELS_URL, 'direct')
    ]).catch(() => 'proxy' as const); // FALLBACK TO PROXY if both timeout (direct is hard blocked)
  }
  workingApiBase = await baseTestPromise;
  return workingApiBase;
}`;
if(code.includes(baseOld)) code = code.replace(baseOld, baseNew); else console.log("Failed base");


// 2. Fix the stream fetch
const streamOld = `  let response = await fetch(chatUrl, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      include_reasoning: includeReasoning,
      max_tokens: maxTokens,
      modalities,
      reasoning,
      image_config: imageConfig,
      plugins,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(async () => ({
      error: {
        message: await response.text(),
      },
    }))) as OpenRouterChatResponse

    throw new Error(
      payload.error?.message ?? 'OpenRouter rejected the streaming chat request.'
    )
  }`;

const streamNew = `  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s connect timeout

  let response;
  try {
    response = await fetch(chatUrl, {
      signal: controller.signal,
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({
        model,
        stream: true,
        messages,
        include_reasoning: includeReasoning,
        max_tokens: maxTokens,
        modalities,
        reasoning,
        image_config: imageConfig,
        plugins,
      }),
    })
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Network timeout: Cloudflare proxy / OpenRouter took too long to connect. Your school network may be completely blocking the stream.');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const payload = (await response.json().catch(async () => ({
      error: {
        message: await response.text(),
      },
    }))) as OpenRouterChatResponse

    throw new Error(
      payload.error?.message ?? 'OpenRouter rejected the streaming chat request.'
    )
  }`;
if(code.includes(streamOld)) code = code.replace(streamOld, streamNew); else console.log("Failed stream");


fs.writeFileSync('src/lib/openrouter.ts', code);
console.log("Done");
