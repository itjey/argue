---
name: full-stack-development
description: 'Plans and implements end-to-end product changes across frontend, backend, APIs, data models, auth, and deployment. Use when building full-stack features, tracing bugs across layers, wiring React or Vite clients to server or Firebase backends, or breaking large product requests into safe incremental steps.'
argument-hint: '[feature or bug]'
---

# Full-Stack Development

## When to Use

- Adding a feature that touches UI, server logic, data storage, and deployment.
- Investigating a bug that may cross browser, API, and persistence boundaries.
- Refactoring a product flow where data contracts and user states must stay aligned.
- Turning an open-ended request into a staged implementation plan with verification.

## When NOT to Use

- Single-file copy edits or cosmetic wording changes.
- Pure visual redesign work with no behavior changes. Use `frontend-design`.
- Firebase-only data or rules work. Use `firebase-development`.
- Narrow component work in a React app with no backend implications. Use `react-typescript-vite`.

## Workflow

### 1. Frame the change

1. Identify the user-facing outcome, constraints, and success conditions.
2. List the affected layers: UI, state, API, data, auth, background jobs, deployment.
3. Decide the smallest safe implementation slice.

### 2. Define contracts before code

1. Write down the input and output shape for each layer.
2. Normalize naming so UI labels, request fields, stored records, and analytics events agree.
3. Prefer explicit loading, error, empty, and retry states over implicit fallthrough.

### 3. Change backend boundaries first

1. Update schemas, route handlers, proxy logic, or Firebase access patterns.
2. Preserve backward compatibility unless the task clearly allows a breaking change.
3. Fail with actionable error messages that the frontend can render directly.

### 4. Implement the UI flow

1. Connect forms, views, and state transitions to the real contract.
2. Keep optimistic behavior deliberate; do not fake success states.
3. Show the user what is happening during network and background work.

### 5. Verify end to end

1. Check happy path, empty state, auth failure, validation failure, and stale data behavior.
2. Run the smallest relevant test, lint, or build command.
3. Confirm configuration or environment changes needed for deployment.

## Quick Reference

| Situation | Default move |
| --- | --- |
| Large request | Break into data contract, backend boundary, UI flow, verification |
| Cross-layer bug | Reproduce at UI, inspect request, inspect response, inspect storage |
| New feature | Define state model and API shape before component work |
| Risky refactor | Keep interfaces stable and ship in small slices |

## Success Criteria

- The change is coherent across all affected layers.
- Data contracts are explicit and testable.
- User-visible states are handled intentionally.
- Validation covers the changed path, not just the edited file.