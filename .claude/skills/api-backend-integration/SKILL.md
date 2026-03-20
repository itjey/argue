---
name: api-backend-integration
description: 'Designs API boundaries and integrates frontend clients with backend routes, proxies, workers, or third-party services. Use when defining request and response contracts, handling auth propagation, adding retries or streaming, debugging server-client mismatches, or connecting UI state to backend behavior.'
argument-hint: '[endpoint, integration, or service]'
---

# API Backend Integration

## When to Use

- Adding or revising a route, proxy, worker, or server handler.
- Connecting frontend interactions to a backend or external service.
- Debugging mismatches between request payloads, responses, and UI assumptions.
- Introducing retries, timeouts, streaming, or normalization layers.

## When NOT to Use

- Visual-only UI work. Use `frontend-design`.
- Firestore modeling or rules changes. Use `firebase-development`.
- Pure component refactors with no network boundary changes. Use `react-typescript-vite`.
- Broad release process work. Use `deployment-and-release`.

## Workflow

### 1. Specify the contract

1. Define request shape, response shape, auth requirements, and failure modes.
2. Keep field names stable and predictable across caller and handler.
3. Distinguish validation failures from transport failures and upstream failures.

### 2. Build the server boundary

1. Validate input before calling downstream services.
2. Normalize upstream responses into a contract the UI can trust.
3. Preserve diagnostic context in logs and error payloads without leaking secrets.

### 3. Wire the client

1. Keep API calls behind a small client layer when reuse or normalization matters.
2. Represent pending, success, empty, rate-limited, and failed states explicitly.
3. Avoid silent retries unless the product requirement supports them.

### 4. Verify the full request path

1. Reproduce with a real payload.
2. Confirm headers, auth context, status handling, and parsing behavior.
3. Test at least one unhappy path.

## Quick Reference

| Problem | Default move |
| --- | --- |
| UI shows vague error | Differentiate validation, network, and upstream errors |
| Endpoint keeps drifting | Centralize request and response typing |
| Proxy bug | Compare inbound payload, transformed payload, and upstream response |
| Streaming feature | Design partial-state handling before UI polish |

## Success Criteria

- Request and response contracts are explicit.
- Client and server failure states are aligned.
- Integration logic is isolated enough to debug quickly.
- The resulting flow is observable under real network conditions.