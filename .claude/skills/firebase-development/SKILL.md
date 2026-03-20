---
name: firebase-development
description: 'Builds and reviews Firebase integrations including Auth, Firestore, Hosting, rules, configuration, and local emulator workflows. Use when adding Firebase-backed features, modeling Firestore data, debugging rules, wiring client SDK code, or preparing Firebase deployment for a web application.'
argument-hint: '[feature, collection, rule, or deploy task]'
---

# Firebase Development

## When to Use

- Adding authentication, Firestore reads or writes, or Firebase hosting behavior.
- Designing a Firestore collection, document shape, or query strategy.
- Updating `firestore.rules`, `firebase.json`, or app initialization.
- Debugging permission-denied errors, emulator mismatches, or deploy issues.

## When NOT to Use

- General backend API design unrelated to Firebase. Use `api-backend-integration`.
- Pure frontend presentation or styling work. Use `frontend-design`.
- Cloudflare-only deployment changes with no Firebase impact. Use `deployment-and-release`.
- Security testing of third-party Firebase targets. That is a different workflow entirely.

## Workflow

### 1. Model data first

1. Define collections, document IDs, required fields, optional fields, and timestamps.
2. Design reads around actual query constraints instead of assuming SQL-style filters.
3. Keep security-rule requirements visible while shaping data.

### 2. Write rules with the feature

1. Update rules in parallel with client capabilities.
2. Express who can read, who can write, and what document invariants must hold.
3. Prefer rules that enforce ownership and field-level invariants instead of trusting the client.

### 3. Wire the client intentionally

1. Keep Firebase initialization centralized.
2. Convert SDK errors into user-facing states with actionable messages.
3. Avoid scattered direct reads and writes inside unrelated UI components.

### 4. Validate locally before deploy

1. Confirm config files and project IDs line up.
2. Use the emulator when available for rules and document-shape validation.
3. Check empty, denied, unauthenticated, and stale-data states.

### 5. Prepare deployment

1. Verify hosting output path and rewrites.
2. Confirm rules files are referenced correctly.
3. Note any required console-side setup that code alone cannot guarantee.

## Quick Reference

| Task | Default move |
| --- | --- |
| New Firestore feature | Design document shape, then rules, then client wiring |
| Permission error | Reproduce request, inspect auth state, inspect rules assumptions |
| Hosting issue | Check `firebase.json` public dir and rewrites |
| Data bug | Compare stored document shape against UI assumptions |

## Repo Notes

- Hosting config lives in `firebase.json`.
- Firestore rules live in `firestore.rules`.
- Project selection is stored in `.firebaserc`.

## Success Criteria

- Document shapes support the required queries.
- Rules and client behavior agree.
- Failure states are visible and debuggable.
- Deployment configuration matches the built app output.