---
name: accessibility-review
description: 'Reviews and improves web accessibility across semantics, keyboard support, focus handling, contrast, forms, and dynamic UI states. Use when building or auditing interfaces for accessible navigation, screen reader clarity, responsive interaction states, or compliance-minded frontend changes.'
argument-hint: '[page, component, or workflow]'
---

# Accessibility Review

## When to Use

- Auditing a screen or component for keyboard and screen-reader usability.
- Building forms, dialogs, menus, tabs, or dynamic status regions.
- Verifying focus behavior after modal, route, or async state changes.
- Improving color contrast and state clarity alongside frontend work.

## When NOT to Use

- Backend-only work.
- Pure visual exploration with no implementation target. Use `frontend-design`.
- Non-interactive markdown or documentation tasks.
- Performance tuning with no accessibility concern. Use `performance-optimization`.

## Workflow

### 1. Check semantics first

1. Prefer native elements when they fit the job.
2. Use headings, landmarks, labels, and button semantics intentionally.
3. Avoid div-based interactions unless there is a real reason.

### 2. Verify interaction paths

1. Ensure all interactive elements are reachable and usable by keyboard.
2. Make focus order logical and visible.
3. Keep disabled, loading, error, and success states understandable without color alone.

### 3. Review dynamic behavior

1. Confirm dialogs trap and restore focus correctly.
2. Ensure async updates do not silently replace content without context.
3. Label form errors and instructions so assistive technology can interpret them.

## Quick Reference

| Problem | Default move |
| --- | --- |
| Clickable div | Replace with a semantic button or link |
| Lost focus after action | Restore or redirect focus intentionally |
| Form errors unclear | Link messages to fields and describe the issue plainly |
| Contrast looks weak | Raise contrast before adding more decoration |

## Success Criteria

- Core flows work with keyboard only.
- Focus visibility and order are deliberate.
- Semantics communicate structure and state clearly.
- Dynamic UI changes remain understandable without guesswork.