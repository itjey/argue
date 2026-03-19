async function run() {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-or-v1-fake-key' },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  console.log(response.status, await response.text());
}
run();
