---
name: performance-optimization
description: 'Profiles and improves web application performance across rendering, bundle size, network behavior, data loading, and runtime responsiveness. Use when debugging slow UI, reducing unnecessary work, tightening loading paths, improving Core Web Vitals, or reviewing performance regressions in React and Vite applications.'
argument-hint: '[screen, interaction, metric, or bottleneck]'
---

# Performance Optimization

## When to Use

- A page feels slow, janky, or heavy.
- Build output or client bundles have grown unexpectedly.
- Rendering work, network waterfalls, or repeated state updates are causing regressions.
- A performance-sensitive interaction needs measurement before tuning.

## When NOT to Use

- Feature planning with no measured or observed performance issue.
- Pure visual redesign work. Use `frontend-design`.
- Backend contract design with no runtime performance concern. Use `api-backend-integration`.
- Infrastructure-only release tasks. Use `deployment-and-release`.

## Workflow

### 1. Measure before changing

1. Identify the slow path and the user-visible symptom.
2. Determine whether the bottleneck is render, network, bundle, parsing, or repeated work.
3. Use concrete evidence instead of intuition.

### 2. Remove the highest-cost work first

1. Reduce unnecessary renders and expensive recomputation.
2. Cut payload size and eager loading on critical paths.
3. Avoid moving work around unless it clearly reduces user-facing cost.

### 3. Re-test the same scenario

1. Compare before and after under the same conditions.
2. Check that the optimization did not damage clarity or correctness.
3. Keep complexity proportional to the gain.

## Quick Reference

| Problem | Default move |
| --- | --- |
| Slow first load | Inspect bundle size, critical assets, and blocking requests |
| Laggy interaction | Trace render frequency and synchronous work |
| Repeated fetches | Centralize request lifecycle and cache intent clearly |
| Premature tuning | Require a measurable bottleneck first |

## Success Criteria

- Performance work targets a measured or clearly reproduced bottleneck.
- Changes reduce user-visible cost without obscuring code intent.
- Verification compares the same path before and after.