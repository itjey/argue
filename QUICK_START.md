# Complete Setup & Getting Started Guide

Everything you need to set up full automation and start developing.

---

## 📋 What You Need

To have **zero-friction development** where I can debug and deploy everything:

### 1. GitHub Access ✓ (You confirmed)
- Your repo: `github.com/itjey/argue`
- I can commit/push directly
- This enables auto-deploy to GitHub Pages

### 2. API Keys (Needed)
Add these to `.env.local` in workspace root:

```bash
# Create/edit .env.local
cat > .env.local << 'EOF'
# OpenRouter - for AI model access
OPENROUTER_API_KEY=sk-...your-key...

# Stripe (if payment features need debugging)
STRIPE_SECRET_KEY=sk_live_...or_sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase (if using)
FIREBASE_API_KEY=...
FIREBASE_PROJECT_ID=argue...

# Server Configuration
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://itjey.github.io
EOF
```

### 3. GitHub Settings (Needs to be enabled once)
- Go to repo **Settings** → **Pages**
- Set: Source = **"GitHub Actions"**
- This allows auto-deployment

---

## ✅ Quick Start (After Setup Above)

### First Time
```bash
# 1. Install dependencies
npm install

# 2. Verify setup
npm run debug

# 3. Start development
npm run dev

# 4. Open browser
open http://localhost:5173

# Done! Start editing files - changes auto-reload
```

### Day-to-Day Development
```bash
# Make changes
vim src/components/MyComponent.tsx

# Test locally (optional)
npm test:watch

# Push (that's it - everything else is automatic)
git add -A
git commit -m "feat: description"
git push

# Watch deployment
# → https://github.com/itjey/argue/actions
# → Site updates at https://itjey.github.io/argue/ (3-5 min)
```

---

## 🎯 What I Can Now Do For You

### ✅ Debugging
```bash
npm run debug              # System health check
npm run debug:env          # Check environment setup
npm run debug:build        # Verify build output
npm run debug:network      # Test API connectivity
```

### ✅ Development
```bash
npm run dev                # Frontend dev server with HMR
npm start                  # Backend server
npm run test:watch         # Auto-run tests on changes
npm run lint:fix           # Auto-fix code style issues
```

### ✅ Pre-Deployment Safety
```bash
npm run validate:deploy    # Check everything before push
# This verifies:
# ✓ TypeScript passes
# ✓ Lint passes
# ✓ Tests pass
# ✓ Build succeeds
# ✓ No uncommitted changes
```

### ✅ Deployment
```bash
git push  # Automatic deployment happens:
          # → GitHub Actions runs CI/CD
          # → Builds production bundle
          # → Deploys to GitHub Pages
          # → Site is live in 3-5 minutes
```

---

## 🔄 GitHub Actions (Automatic)

Every push to `main` triggers:

1. **Lint Check** (1 min)
   - Validates code style
   - ✅ Passes: continues
   - ❌ Fails: blocks merge (fix locally: `npm run lint:fix`)

2. **Type Check** (1 min)
   - TypeScript compilation
   - ✅ Passes: continues
   - ❌ Fails: blocks deploy (fix locally: errors shown)

3. **Test Suite** (2 min)
   - Vitest runs all tests
   - ✅ Passes: continues
   - ❌ Fails: blocks deploy (fix locally: `npm test:watch`)

4. **Production Build** (2 min)
   - Optimized bundle
   - ✅ Passes: continues
   - ❌ Fails: blocks deploy (fix locally: `npm run build`)

5. **Deploy to GitHub Pages** (1 min)
   - Publishes to github.com/itjey/argue/deployments
   - 🌐 Live at: https://itjey.github.io/argue/

**Total Time**: ~5-7 minutes from push to live site

---

## 📁 Project Structure (You Don't Need to Reorganize)

```
argue/
├── src/                          # React frontend code
│   ├── components/               #   - React components
│   ├── lib/                      #   - Backend integration, config
│   ├── __tests__/                #   - Tests
│   └── App.tsx                   #   - Main app
├── server/                       # Node.js backend
│   └── index.mjs                 #   - Main server (port 3000)
├── public/                       # Static assets
├── dist/                         # Built output (generated)
│
├── .github/workflows/            # GitHub Actions (I created)
│   ├── ci.yml                    #   - Lint, test, build
│   └── deploy-pages.yml          #   - Deploy to GitHub Pages
├── scripts/                      # Utility scripts
│   ├── debug.mjs                 #   - Diagnostics
│   └── validate-deploy.mjs       #   - Pre-deploy checks
│
├── package.json                  # Scripts and dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
├── vitest.config.ts              # Test config
└── .env.local                    # Secrets (not committed)
```

---

## 🚨 Troubleshooting

### Website not updating after push?
```bash
# 1. Check deployment
gh run view --log  # or check Actions tab

# 2. Force clear cache
# In browser: Shift+Cmd+R (Mac) or Ctrl+Shift+R (Windows)

# 3. Check if Pages is enabled
gh api repos/itjey/argue/pages
```

### Tests failing locally?
```bash
npm test:watch  # Run in watch mode
# Fix failures until all pass
# Then push
```

### Build failing?
```bash
npm run build  # See the exact error
# Fix the error shown
npm run build  # Verify it works
# Then push
```

### Can't push - uncommitted changes?
```bash
git status  # See what's modified
git add -A
git commit -m "fix: description"
# Then try push again
```

---

## 🎓 Learning Resources

### Frontend Development
- Vite: https://vitejs.dev/guide/
- React: https://react.dev/learn
- TypeScript: https://www.typescriptlang.org/docs/

### Backend Integration
- See: [BACKEND_DEBUGGING.md](BACKEND_DEBUGGING.md)
- API testing: [curl examples in BACKEND_DEBUGGING.md](BACKEND_DEBUGGING.md#-testing-backend-endpoints)

### Deployment
- See: [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md)
- GitHub Pages: https://pages.github.com/
- GitHub Actions: https://docs.github.com/en/actions

### Testing
- Vitest: https://vitest.dev/guide/
- Testing Library: https://testing-library.com/docs/react-testing-library/intro

---

## 📞 All Available Commands

```bash
# Development
npm run dev                    # Frontend dev (HMR)
npm start                      # Backend server
npm run test:watch             # Tests (auto-run)

# Quality & Deployment
npm run lint                   # Check style
npm run lint:fix               # Auto-fix style
npm test                       # Run tests once
npm run build                  # Prod build

# Debugging & Deployment
npm run debug                  # System health check
npm run validate:deploy        # Pre-flight checks
npm run deploy:github-pages    # Manual deploy (usually automatic)

# One-off Checks
npm run debug:env              # Environment variables
npm run debug:build            # Build artifacts
npm run debug:network          # API connectivity
```

---

## ✨ You're Ready!

**Setup checklist:**
- [ ] `.env.local` created with API keys
- [ ] `npm install` completed
- [ ] `npm run debug` shows ✓ checks
- [ ] GitHub Pages enabled in Settings
- [ ] Pushed a test commit to see auto-deploy

**After setup:**
- Edit files → `npm run dev` auto-reloads
- Push code → GitHub Actions auto-deploys
- No manual deployment needed

**Questions?** Check the detailed guides:
- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)
- [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md)
- [BACKEND_DEBUGGING.md](BACKEND_DEBUGGING.md)

---

## 🚀 I Can Now Help With

✅ Debug any issue across the stack
✅ Implement features end-to-end
✅ Fix bugs in frontend or backend
✅ Optimize performance
✅ Deploy safely with zero risk
✅ Write and run tests
✅ Refactor code
✅ Review and improve code quality

**Just describe what needs to be done, and I'll handle all the debugging, testing, and deployment automatically.**
