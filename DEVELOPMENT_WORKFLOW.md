# Full-Stack Development Workflow & Automation

**Goal**: Zero-friction development where all debugging, deployment, and backend management is automated.

---

## 📋 Prerequisites (One-Time Setup)

### 1. GitHub Setup
```bash
# Create GitHub token with repo + workflow permissions
# Store in: ~/.gh_token or use: gh auth login

# Enable GitHub Pages:
# - Go to repo settings → Pages
# - Set source to "GitHub Actions"
# - Allow workflows to have write permissions
```

### 2. Environment Configuration
Create `.env.local` in workspace root:
```bash
# API Keys
OPENROUTER_API_KEY=your_key_here
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Deployment
GITHUB_TOKEN=your_github_token
GITHUB_REPO=itjey/argue

# Firebase (if using)
FIREBASE_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project
FIREBASE_AUTH_DOMAIN=your_auth_domain

# Server Config
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://itjey.github.io
```

### 3. Install Dependencies
```bash
npm install
npm install --save-dev tsx nodemon concurrently
```

---

## 🚀 Available Commands

### Local Development (Auto-rebuild & debug)
```bash
npm run dev                    # Frontend dev server (Vite HMR)
npm run dev:full              # Frontend + backend + auto-test (if created)
npm run build                 # Production build
npm run preview               # Preview prod build locally
```

### Backend Server
```bash
npm start                      # Start Node server (port 3000)
npm run server:debug           # Start with debug logs (if configured)
npm run server:watch           # Auto-restart on changes (if configured)
```

### Testing & Debugging
```bash
npm test                       # Run all tests once
npm run test:watch             # Watch mode for active development
npm run lint                   # Check code quality
npm run lint:fix               # Auto-fix lint issues
```

### Deployment
```bash
npm run deploy:github-pages    # Build & deploy to GitHub Pages
npm run deploy:preview         # Deploy preview version
```

---

## 🔄 GitHub Actions Workflows (Automated)

### On Every Push
1. **Lint Check** - Validates code style (auto-fixes available)
2. **Type Check** - TypeScript compilation
3. **Test Suite** - Runs Vitest
4. **Build Test** - Ensures production build succeeds

### On Push to `main`
1. **Production Build** - Optimized bundle
2. **Deploy to GitHub Pages** - Auto-published
3. **Notify** - Deploy status notifications

---

## 🐛 Debugging Workflow

### Frontend Debugging
```bash
# 1. Start dev server
npm run dev

# 2. Open browser at http://localhost:5173
# 3. Use Chrome DevTools:
#    - Sources tab: Set breakpoints
#    - Console: Log and test
#    - Network: Inspect API calls
```

### Backend Debugging
```bash
# 1. Start with debug logging
VITE_DEBUG=true npm start

# 2. Check logs for:
#    - API request/response traces
#    - Auth failures
#    - Data validation errors
#    - Performance metrics

# 3. Use Node inspector (if configured):
node --inspect server/index.mjs
#    Then: chrome://inspect in Chrome
```

### Full-Stack Debugging
```bash
# 1. Terminal 1
npm run dev

# 2. Terminal 2
npm start

# 3. Open http://localhost:3000 (or dev server proxy)
# 4. Trace through browser + backend logs simultaneously
```

### Testing-Driven Debugging
```bash
# 1. Write a test that reproduces the issue
# 2. Run in watch mode
npm run test:watch

# 3. Fix code until test passes
# 4. Commit with test included
```

---

## 📦 Deployment Process

### Manual Deployment
```bash
# 1. Verify everything works
npm run lint
npm test
npm run build

# 2. Deploy to GitHub Pages
npm run deploy:github-pages

# 3. Visit https://itjey.github.io/argue/ to verify
```

### Automated Deployment
All automation happens on push to `main`:
```bash
git add -A
git commit -m "feature: add new capability"
git push  # → Everything else is automatic
```

---

## 🔍 Monitoring & Logs

### Access Logs
```bash
# Backend server logs (running locally)
tail -f server.log  # or view in terminal output

# GitHub Actions logs
gh run view --log    # View last run
gh run view -w       # Interactive mode
```

### Common Issues & Quick Fixes

| Issue | Solution |
|-------|----------|
| **Port 3000 already in use** | `lsof -i :3000` then kill process |
| **Module not found** | `npm install` (deps changed) |
| **TypeScript errors** | `npm run lint:fix` then check lint output |
| **Build fails** | `rm -rf dist node_modules && npm install && npm run build` |
| **GitHub Pages won't update** | Clear browser cache, check Actions tab for deploy status |
| **Backend API errors** | Check `.env.local` has all required keys |

---

## 🛠️ Advanced Automation Setup

The following files can be created for advanced automation:
- `.github/workflows/ci.yml` - Continuous integration
- `.github/workflows/deploy.yml` - Auto-deploy GitHub Pages
- `scripts/debug.mjs` - Enhanced debugging tools
- `scripts/validate-deploy.mjs` - Pre-deployment validation

See **AUTOMATION_SETUP.md** for detailed configuration.

---

## 📝 Daily Workflow Checklist

- [ ] Clone/pull latest code
- [ ] Run `npm install` (if package.json changed)
- [ ] Start dev server: `npm run dev`
- [ ] Start backend: `npm start` (if backend work)
- [ ] Make changes, save (HMR refreshes frontend)
- [ ] Run tests: `npm test` or `npm run test:watch`
- [ ] Push: `git push` (GitHub Actions handles deployment)
- [ ] Verify: Check GitHub Pages site after 2-3 minutes

---

## 🎯 Next Steps

1. **Create `.env.local`** with your API keys
2. **Run `npm install`** to get dependencies
3. **Start dev server**: `npm run dev`
4. **Set up GitHub Actions** (see AUTOMATION_SETUP.md)
5. **Enable GitHub Pages** in repo settings

**After setup, you never need to manually deploy again!**

---

## 📚 Additional Resources

- [Vite Dev Server Docs](https://vitejs.dev/guide/ssr.html)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js Debugging](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [TypeScript in Vite](https://vitejs.dev/)
