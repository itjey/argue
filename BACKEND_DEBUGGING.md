# Backend Debugging & API Integration Guide

Complete guide to debugging and working with the backend services.

---

## 🏗️ Backend Architecture

```
Frontend (React/Vite) 
    ↓
    ├─→ Node.js Server (server/index.mjs:3000)
    │       ├─→ OpenRouter API (model inference)
    │       ├─→ Stripe (payments)
    │       └─→ Firebase (auth/data)
    │
    └─→ Cloudflare Workers (proxy/worker.ts)
            └─→ OpenRouter API (via CF edge)
```

---

## 🚀 Starting Backend Server

### Basic Start
```bash
npm start
# Starts on http://localhost:3000
```

### With Environment Variables
```bash
OPENROUTER_API_KEY=sk-... PORT=3001 npm start
```

### With Debug Logging
```bash
DEBUG=* npm start
# Shows all internal logs
```

### Watch Mode (Auto-restart on changes)
```bash
npm install --save-dev nodemon
npx nodemon --exec npm start server/index.mjs
```

---

## 🔍 Common Backend Debugging Scenarios

### Issue: API Returns 401 Unauthorized
```bash
# Check 1: Missing API key
echo $OPENROUTER_API_KEY

# Fix: Set in .env.local
echo "OPENROUTER_API_KEY=sk-..." >> .env.local

# Check 2: Verify key is valid
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models
```

### Issue: CORS Errors
```bash
# The backend should handle CORS. Check server logs:
grep -n "CORS" server/index.mjs

# Verify ALLOWED_ORIGINS in .env.local
grep ALLOWED_ORIGINS .env.local

# Should include: http://localhost:5173,http://localhost:3000
```

### Issue: Stripe Webhook Failures
```bash
# Check webhook secret is set
grep STRIPE_WEBHOOK_SECRET .env.local

# Verify in Stripe Dashboard:
# Settings > Webhooks > Signing secret

# Test locally with:
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> .env.local
npm start
# Then use Stripe CLI to forward webhooks
```

### Issue: Request Timeout
```bash
# Check server logs for timing
DEBUG=* npm start | grep -i timeout

# Increase timeout in requests (if applicable):
# Look for fetch() or axios timeout settings
```

---

## 📊 Testing Backend Endpoints

### Test OpenRouter Proxy
```bash
# 1. Start backend
npm start

# 2. In another terminal, test the endpoint
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

### Test Stripe Webhook
```bash
# Install Stripe CLI:
# https://stripe.com/docs/stripe-cli

stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# In another terminal, trigger test event:
stripe trigger payment_intent.succeeded
```

### Test Firebase Integration
```bash
# Check if Firebase is initialized in client
grep -r "initializeApp" src/

# Verify Firebase config in .env.local
grep FIREBASE src/.env

# Test connection
npm run dev  # Start frontend
# Check browser console for Firebase initialization
```

---

## 🐛 Debug Full-Stack Request

Follow a request from frontend through backend:

### 1. Capture Request in Browser
```javascript
// In browser console:
fetch('http://localhost:3000/api/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({...})
}).then(r => r.json()).then(console.log)
```

### 2. Check Backend Logs
```bash
# Terminal running: npm start
# Should show:
# - Incoming POST request
# - Authorization header check
# - Forwarding to OpenRouter
# - Response status
```

### 3. Inspect Network Tab
```
DevTools → Network → Filter: XHR
- Click request
- Headers: Check Authorization, content-type
- Response: Check status code and body
- Timing: See latency breakdown
```

### 4. Verify Response at Each Layer
```bash
# At OpenRouter API:
curl -v https://openrouter.ai/api/v1/models | head -5

# Through your backend proxy:
curl -v http://localhost:3000/api/v1/models | head -5

# Difference = backend is modifying response
```

---

## 🔐 Environment Variables Reference

```bash
# Required for basic operation
OPENROUTER_API_KEY=sk-...          # OpenRouter API key
PORT=3000                          # Server port (default: 3000)

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...      # Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...    # Stripe webhook signing

# Firebase (if using)
FIREBASE_API_KEY=...
FIREBASE_PROJECT_ID=...
FIREBASE_AUTH_DOMAIN=...

# CORS & deployment
ALLOWED_ORIGINS=http://localhost:5173,api.example.com

# Debugging
DEBUG=*                            # Enable all debug logs
NODE_ENV=development               # or 'production'
```

---

## 📈 Performance Debugging

### Check Backend Response Times
```bash
npm start  # Watch output for ~200ms base latency

# Test with timing header
curl -w "@curl-format.txt" -o /dev/null -s \
  http://localhost:3000/api/v1/models
```

### Monitor Memory Usage
```bash
node --expose-gc server/index.mjs

# In Node REPL:
# gc()  # Run garbage collection
# v8.getHeapStatistics()
```

### Find Slow API Calls
```bash
DEBUG=* npm start 2>&1 | grep -i "duration\|took"
```

---

## 🧪 Mock Testing

### Mock OpenRouter Without Real API Key
```bash
# Set dummy key
export OPENROUTER_API_KEY=test-key-12345

# Backend should still start
npm start

# Test will fail at actual API call (expected)
curl http://localhost:3000/api/v1/models  # See the error structure
```

### Local Test Fixtures
Create `test-fixtures.json`:
```json
{
  "openrouter_models": {
    "data": [
      {
        "id": "openai/gpt-3.5-turbo",
        "name": "GPT-3.5 Turbo",
        "context_length": 4096
      }
    ]
  }
}
```

Then mock in server:
```javascript
// For local testing only
if (process.env.USE_FIXTURES === 'true') {
  const fixtures = JSON.parse(fs.readFileSync('./test-fixtures.json'))
  // Serve from fixtures instead of API
}
```

---

## 📝 Logs & Monitoring

### Enable Detailed Logging
```bash
DEBUG=argue:* npm start  # Type-specific logs
```

### Structured Logging (if applicable)
```bash
# Server would log in JSON format
npm start 2>&1 | jq .  # Parse JSON logs

# Filter by level
npm start 2>&1 | jq 'select(.level == "error")'
```

### Real-Time Log Monitoring
```bash
npm start 2>&1 | tee server.log | grep -i error

# Later, review full log
cat server.log
```

---

## 🔗 Common Code Locations

- **Main Server**: [server/index.mjs](server/index.mjs)
- **API Routes**: [server/index.mjs](server/index.mjs#L100) (search for route handlers)
- **Firebase Config**: [src/lib/firebase.ts](src/lib/firebase.ts)
- **OpenRouter Client**: [src/lib/openrouter.ts](src/lib/openrouter.ts)
- **Tests**: [src/__tests__/](src/__tests__/)

---

## 🆘 Troubleshooting Checklist

| Issue | Check |
|-------|-------|
| **Server won't start** | `lsof -i :3000` - port in use? |
| **API key errors** | `.env.local` has key? Key not expired? |
| **CORS blocked** | ALLOWED_ORIGINS includes frontend URL? |
| **Stripe errors** | Webhook secret correct? Live/test mode mismatch? |
| **Firebase errors** | Config correct? Authentication enabled? |
| **Timeout errors** | Increase timeout values? Network connectivity? |
| **Memory errors** | `node --max-old-space-size=4096 server/...` |

---

## 📚 Additional Resources

- [Node.js Debugging](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Express.js (if using)](https://expressjs.com/en/guide/debugging.html)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Firebase Documentation](https://firebase.google.com/docs)
