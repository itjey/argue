---
name: deployment-and-release
description: 'Prepares and validates application releases across local, preview, and production environments. Use when configuring environment variables, hosting output, server entrypoints, Firebase or Cloudflare deployment, release checklists, or rollout-safe changes for a web application.'
argument-hint: '[target environment or release task]'
---

# Deployment and Release

## When to Use

- Preparing a web app for preview or production deployment.
- Updating environment variables, hosting config, routes, rewrites, or server entrypoints.
- Verifying that build output, runtime assumptions, and deploy targets agree.
- Packaging a feature with a release checklist and rollback awareness.

## When NOT to Use

- Day-to-day component implementation.
- Feature design with no deployment implications.
- Firebase data-model or rules design without release changes. Use `firebase-development`.
- Pure debugging where deployment is not the failure boundary. Use `testing-and-debugging`.

## Workflow

### 1. Identify the runtime shape

1. Confirm what runs in the browser, what runs on the server, and what is static output.
2. Verify entrypoints, generated assets, and expected runtime environment variables.
3. Check whether the target is Firebase Hosting, Cloudflare, Node, or a mixed setup.

### 2. Validate configuration

1. Check build scripts, output directories, rewrites, and asset paths.
2. Ensure environment configuration differs only where it should.
3. Keep secrets out of client bundles and source control.

### 3. Run a release check

1. Build the app the same way the deploy target will.
2. Confirm critical routes, auth flows, and API endpoints still function.
3. Inspect failure behavior for missing config or unreachable services.

### 4. Ship with rollback awareness

1. Note any irreversible changes such as schema or rules changes.
2. Prefer staged rollout or isolated config changes when risk is high.
3. Keep a short rollback path for the specific change.

## Quick Reference

| Problem | Default move |
| --- | --- |
| Works locally only | Compare runtime env and hosting assumptions |
| Broken route after deploy | Check rewrites, base paths, and static asset output |
| Mixed platform deploy | Separate browser build, server runtime, and edge config |
| High-risk release | Isolate config, document rollback, verify critical paths |

## Success Criteria

- Build output matches the hosting target.
- Environment assumptions are explicit.
- Critical user flows were validated before release.
- The release can be diagnosed or rolled back without guesswork.