async function run() {
  const url = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer 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', 'HTTP-Referer': 'https://itjey.github.io/argue/', 'X-Title': 'Argue' },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  console.log('Status:', response.status);
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(Buffer.from(value).toString('utf8'));
  }
}
run();
