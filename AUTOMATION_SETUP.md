# Automation Setup Guide

Complete setup for zero-friction development and deployment.

---

## 🎯 What Gets Automated

### ✅ Already Configured
- **GitHub Actions CI/CD** - Lint, test, build on every push
- **GitHub Pages Deployment** - Auto-deploy main branch to GitHub Pages
- **Environment-based builds** - Different config for dev vs production

### 🔄 Now Available
- **Local development automation** - File watch, auto-rebuild, auto-test
- **Backend server management** - Auto-restart, debug logging
- **Pre-deployment validation** - Safety checks before GitHub push
- **Debugging toolkit** - Enhanced logging and tracing

---

## 📋 Step-by-Step Setup

### Step 1: Enable GitHub Pages

1. Go to `https://github.com/itjey/argue/settings/pages`
2. Under "Build and deployment":
   - Set Source to **"GitHub Actions"**
3. Under "Actions permissions":
   - Allow workflows to have **write permissions**

### Step 2: Configure Secrets (Optional)

For advanced features, add to GitHub repo settings:
```bash
# Settings > Secrets and variables > Actions > New repository secret
DEPLOY_WEBHOOK_URL=   # For notifications
SLACK_WEBHOOK_URL=    # For Slack notifications
```

### Step 3: Verify Workflows Running

1. Go to repo's **Actions** tab
2. You should see:
   - `CI - Lint, Test, Build` workflow
   - `Deploy to GitHub Pages` workflow
3. Both should have green checkmarks on latest main push

### Step 4: Test the Pipeline

```bash
# Make a small change
echo "// test" >> src/main.tsx

# Commit and push
git add -A
git commit -m "test: verify CI/CD pipeline"
git push

# Watch Actions tab:
# - CI runs (2-3 min)
# - Deploy runs (1-2 min)
# - Site updates at https://itjey.github.io/argue/
```

---

## 🛠️ Optional: Local Automation Scripts

### Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev:full": "concurrently \"npm run dev\" \"npm start\"",
    "dev:watch": "npm run dev:full -- --inspect",
    "server:watch": "nodemon --exec node server/index.mjs",
    "server:debug": "DEBUG=* npm start",
    "deploy:github-pages": "git add -A && npm run build && echo 'Push to deploy: git push'",
    "validate:deploy": "npm run lint && npm test && npm run build",
    "clean": "rm -rf dist node_modules && npm install"
  }
}
```

### Install Utilities

```bash
npm install --save-dev concurrently nodemon
```

---

## 📊 Monitoring & Verification

### Check CI Status

```bash
# Using GitHub CLI
gh run list --limit 10

# Watch live
gh run watch

# View specific run logs
gh run view <RUN_ID> --log
```

### Check Deployment Status

```bash
# View Pages deployment history
gh api repos/itjey/argue/deployments

# Visit your live site
open https://itjey.github.io/argue/
```

---

## 🔐 Secrets Management

### What Secret Do You Need?

Only needed if you want GitHub Actions to deploy elsewhere:
- **GitHub Token** → Already built-in (GITHUB_TOKEN)
- **Stripe Keys** → Only needed on backend (use .env.local locally)
- **Firebase** → Only needed in app (use .env.local locally)

### Never Commit Secrets
```bash
# Make sure .env.local is in .gitignore (should be default)
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "ensure: .env.local not tracked"
```

---

## 🚨 Troubleshooting

### GitHub Actions Won't Start
```bash
# Check if workflows are enabled
gh repo view itjey/argue --json repositoryTopics

# Fix: Go to Settings > Actions > General
# Make sure "Allow all actions" is selected
```

### Pages Deployment Fails
```bash
# Check if Pages is enabled
gh api repos/itjey/argue/pages

# Fix: Settings > Pages > Source should be "GitHub Actions"
```

### Build Failures in Actions

```bash
# View the full log
gh run view <RUN_ID> --log | tail -50

# Common fixes:
# 1. Check npm version matches locally
npm --version  # Should be similar in CI

# 2. Clear Actions cache
gh run list --workflow=ci.yml | head -1 | awk '{print $1}' | xargs gh run download

# 3. Force rebuild
git commit --allow-empty -m "trigger: rebuild"
git push
```

### Site Not Updating After Deploy

```bash
# 1. Hard refresh browser
# Ctrl+Shift+R  OR  Cmd+Shift+R

# 2. Check if deployment actually happened
gh api repos/itjey/argue/pages

# 3. Check Actions tab for failed deploy job

# 4. Verify base path in vite.config.ts
# Should include: base: '/argue/' for GitHub Pages
```

---

## 🔄 Typical Workflow After Setup

```bash
# 1. Make changes locally
vim src/components/MyComponent.tsx

# 2. Test locally
npm run test:watch  # Optional, but recommended

# 3. Commit and push (that's it!)
git add -A
git commit -m "feat: add my feature"
git push

# 4. GitHub Actions automatically:
#    ✅ Lints code
#    ✅ Type-checks with TypeScript
#    ✅ Runs all tests
#    ✅ Builds for production
#    ✅ Deploys to GitHub Pages

# 5. Site is live in 3-5 minutes
# Watch: https://github.com/itjey/argue/actions
```

---

## 🎉 You're Done!

Your workflow is now:
- ✅ Fully automated
- ✅ Zero manual deployment steps
- ✅ Safety checks before deploy
- ✅ Clear failure diagnostics

**Just push code. Everything else is automatic.**

---

## 📞 Support Commands

```bash
# Latest deployment status
gh run list --limit 5

# View full logs
gh run view --log

# Trigger manual deployment
gh workflow run deploy-pages.yml

# View Pages settings
gh api repos/itjey/argue/pages
```
