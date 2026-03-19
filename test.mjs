const key = "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";
const urls = [
  "https://holy-union-290f.jeynarayan2010.workers.dev/api/v1/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
  "https://app.gphmt.org/api/v1/chat/completions"
];

for (const url of urls) {
  try {
    console.log("Testing:", url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{role: "user", content: "say exactly: 'WORKS'"}]
      })
    });
    console.log("Status:", res.status);
    const t = await res.text();
    console.log("Response:", t.substring(0, 100));
  } catch (e) {
    console.log("Failed:", e.message);
  }
}
