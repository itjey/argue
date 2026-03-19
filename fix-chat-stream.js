const fs = require('fs');
let code = fs.readFileSync('src/lib/openrouter.ts', 'utf8');

const oldChatStreamStr = `  let response = await fetch(chatUrl, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({`;

const newChatStreamStr = `  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout for initial handshake

  let response;
  try {
    response = await fetch(chatUrl, {
      signal: controller.signal,
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify({`;

code = code.replace(oldChatStreamStr, newChatStreamStr);

const oldChatStreamChecks = `  if (!response.ok) {
    const payload = (await response.json().catch(async () => ({`;

const newChatStreamChecks = `  clearTimeout(timeoutId);

  if (!response.ok) {
    const payload = (await response.json().catch(async () => ({`;

code = code.replace(oldChatStreamChecks, newChatStreamChecks);

code = code.replace(`} catch (err) {
      if (err instanceof Error) {
        throw err
      }
      throw new Error(String(err))
    }
  }

  return aggregatedReply
}`, `} catch (err) {
      if (err instanceof Error) {
        throw err
      }
      throw new Error(String(err))
    }
  }

  return aggregatedReply
} catch (error) {
  clearTimeout(timeoutId);
  throw error;
}`);

// Do the same for non-stream:
const oldChatStr = `  let response = await fetch(chatUrl, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({`; // this matches non-stream too, let's do it carefully using regex.

fs.writeFileSync('src/lib/openrouter.ts', code);
