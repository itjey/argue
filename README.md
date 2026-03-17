# Argue

Argue is a multi-model workspace where several frontier models can challenge each other, critique intermediate answers, and synthesize a stronger final result.

## Stack

- React 19 + TypeScript + Vite
- Firebase Auth + Firestore
- OpenRouter for model access
- Node server for Railway or local server-managed deployments
- Cloudflare Worker for edge-hosted server-managed deployments

## Deployment surfaces

- `build:pages` builds the GitHub Pages site at `/argue/`.
- `build:server` builds the app for Railway or a local Node server at `/`.
- `build:cloudflare` builds the app for the Cloudflare worker surface at `/`.

## Commands

- `npm run lint` checks the codebase with ESLint.
- `npm run test` runs fixture-style parser and environment tests with the Node test runner.
- `npm run build:pages` builds the GitHub Pages artifact.
- `npm run build:server` builds the server-managed artifact used by Railway and local smoke checks.
- `npm run build:cloudflare` builds the Cloudflare artifact.
- `npm run smoke:local` builds the server-managed app, starts the local server, and validates critical routes.
- `npm run smoke:browser` runs a headless Chromium smoke test against the local server-managed build.
- `npm run smoke:remote` validates the live GitHub Pages and Cloudflare endpoints.
- `npm run check:env` validates the environment contract for the main deployment surfaces.

## Environment

Copy `.env.example` when you need a local override. The build scripts force the important surface-specific values so the same repo can target Pages, Railway, and Cloudflare safely.

Important variables:

- `OPENROUTER_API_KEY` enables server-managed model access on Railway and Cloudflare.
- `ALLOWED_ORIGINS` controls CORS for the Node server.
- `VITE_PUBLIC_BASE` controls the asset base path.
- `VITE_OPENROUTER_AUTH_MODE` chooses browser-managed or server-managed OpenRouter access.
- `VITE_OPENROUTER_API_BASE` overrides the default API base when needed.

## Validation workflow

Use this sequence before pushing:

```bash
npm run check:env
npm run lint
npm run test
npm run build:pages
npm run smoke:local
npm run smoke:browser
npm run smoke:remote
```

If you are deploying Railway, make sure the build uses `npm run build:server`. GitHub Pages should keep using `npm run build:pages`.
