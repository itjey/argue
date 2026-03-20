---
name: react-typescript-vite
description: 'Implements React, TypeScript, and Vite features with maintainable component structure, state modeling, and build-safe changes. Use when adding components, refactoring hooks or state flows, fixing rendering bugs, organizing client code, or aligning UI changes with strict TypeScript expectations.'
argument-hint: '[component, hook, or bug]'
---

# React TypeScript Vite

## When to Use

- Building or refactoring React components in a Vite application.
- Fixing rendering issues, prop-shape mistakes, or state transition bugs.
- Improving client-side code organization, data flow, or component boundaries.
- Adding UI tests around React behavior.

## When NOT to Use

- Styling-first redesigns. Use `frontend-design`.
- Firebase-specific rules or hosting tasks. Use `firebase-development`.
- Server route or proxy work with minimal client impact. Use `api-backend-integration`.
- Repository-wide release or environment setup. Use `deployment-and-release`.

## Workflow

### 1. Clarify component responsibility

1. Decide what the component owns, what it receives, and what it emits.
2. Keep data-fetching, transformation, and presentational concerns separated when possible.
3. Prefer explicit prop and state types over inferred ambiguity in shared surfaces.

### 2. Model states directly

1. Enumerate loading, success, empty, error, and disabled states.
2. Avoid boolean piles when a discriminated state model is clearer.
3. Keep derived values close to where they are used.

### 3. Implement with Vite-safe patterns

1. Use import paths and module boundaries that survive build and test.
2. Keep browser-only code out of shared server paths.
3. Let TypeScript guide API clarity instead of fighting it with casts.

### 4. Verify behavior

1. Test user-visible state transitions, not just helper functions.
2. Run lint or tests for the changed surface.
3. Check that the build still succeeds after refactors.

## Quick Reference

| Problem | Default move |
| --- | --- |
| Confusing state | Replace multiple booleans with a named state model |
| Large component | Split by responsibility, not by arbitrary line count |
| Prop drift | Promote a shared type or tighten the boundary |
| Render bug | Reproduce from props and state transitions first |

## Success Criteria

- Components have clear responsibilities.
- Types match actual runtime states.
- Tests or checks cover the changed behavior.
- The result remains easy to extend without rewrites.