async function run() {
  const url = 'https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  console.log(response.status, await response.text());
}
run();
