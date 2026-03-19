async function run() {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer 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', 'HTTP-Referer': 'https://itjey.github.io/argue/', 'X-Title': 'Argue' },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  console.log(response.status, await response.text());
}
run();
