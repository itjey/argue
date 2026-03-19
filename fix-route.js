const fs = require('fs');
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

const regex = /async function getWorkingApiBase\(\): Promise<'direct' \| 'proxy'> \{[\s\S]*?return workingApiBase;\n\}/;

const newRouter = `async function getWorkingApiBase(): Promise<'direct' | 'proxy'> {
  if (workingApiBase) return workingApiBase;
  if (!baseTestPromise) {
    const testUrl = async (url: string, type: 'direct' | 'proxy') => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000); // Increased from 1.5s to 4s for slower school wifis
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
      testUrl(PROXY_MODELS_URL, 'proxy'), // Test proxy first just in case
      testUrl(OPENROUTER_MODELS_URL, 'direct')
    ]).catch(() => 'proxy' as const); // fallback to PROXY if both timeout, since we know openrouter is blocked at school
  }
  workingApiBase = await baseTestPromise;
  return workingApiBase;
}`;

code = code.replace(regex, newRouter);

fs.writeFileSync('src/lib/openrouter.ts', code);
