---
name: testing-and-debugging
description: 'Creates focused test plans and root-cause debugging workflows for web applications. Use when reproducing bugs, isolating regressions, adding Vitest coverage, validating edge cases, investigating flaky behavior, or checking build and lint failures after code changes.'
argument-hint: '[bug, failing path, or target file]'
---

# Testing and Debugging

## When to Use

- A bug is reported but the actual failure point is unclear.
- A change needs targeted tests rather than broad untuned coverage.
- Build, lint, or runtime regressions appear after edits.
- A feature behaves differently across local states, user roles, or data shapes.

## When NOT to Use

- Broad product planning with no active bug or test target.
- Pure visual design exploration. Use `frontend-design`.
- Deployment-only tasks. Use `deployment-and-release`.
- Data-model design with no active verification need. Use `firebase-development` or `full-stack-development`.

## Workflow

### 1. Reproduce precisely

1. Capture the exact input, environment, and expected behavior.
2. Reduce the case until the failure is small and repeatable.
3. Identify whether the bug is data-dependent, timing-dependent, or state-dependent.

### 2. Trace the failure boundary

1. Start at the first visible symptom.
2. Walk backward through state, network, parsing, and storage boundaries.
3. Separate cause from downstream noise.

### 3. Fix at the root

1. Prefer invariant-restoring changes over output patching.
2. Keep the fix small enough to reason about.
3. Add guards only when they encode a real rule.

### 4. Lock it in with verification

1. Add or update the narrowest test that proves the bug is fixed.
2. Run only the relevant checks first, then broader checks if needed.
3. Verify nearby edge cases that could regress from the same cause.

## Quick Reference

| Situation | Default move |
| --- | --- |
| Unknown bug | Reproduce, narrow, trace boundary, then patch |
| Missing test | Add one that demonstrates behavior before and after |
| Flaky result | Check timing, async state, and stale shared setup |
| Build failure | Classify type, import path, config, or syntax issue first |

## Success Criteria

- The cause is identified, not guessed.
- Verification covers the fixed behavior.
- The fix does not rely on unrelated refactors.
- Nearby regressions were considered deliberately.