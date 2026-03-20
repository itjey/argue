---
name: frontend-design
description: 'Designs polished frontend interfaces for web applications. Use when improving visual direction, layout, typography, responsive behavior, interaction states, motion, color systems, or turning functional UI into a production-ready interface without drifting into generic design.'
argument-hint: '[screen, component, or design goal]'
---

# Frontend Design

## When to Use

- Redesigning a page, dashboard, workflow, or component library surface.
- Translating a vague product ask into a concrete visual direction.
- Improving hierarchy, spacing, readability, responsiveness, or motion.
- Making a feature feel deliberate instead of default-generated.

## When NOT to Use

- Behavior-only fixes with no design implications.
- Backend or data-model work.
- Copywriting-only tasks.
- Existing design-system work where the goal is strict adherence rather than exploration.

## Design Rules

1. Choose a clear visual direction before writing component CSS.
2. Define tokens up front for color, spacing, radius, shadow, and type scale.
3. Avoid flat one-color backgrounds unless the product already uses that language.
4. Make loading, hover, focus, disabled, empty, and error states feel designed, not appended.
5. Use motion sparingly and purposefully to support hierarchy and orientation.

## Workflow

### 1. Establish direction

1. Pick the overall tone: editorial, technical, playful, premium, dense, minimal, or bold.
2. Define the primary contrast strategy and supporting accents.
3. Decide which elements should dominate first view.

### 2. Build structure

1. Create a layout rhythm with intentional spacing.
2. Use type scale and weight to signal reading order.
3. Keep the main action obvious at desktop and mobile widths.

### 3. Add interaction quality

1. Design hover, focus, pressed, active, and disabled states as first-class states.
2. Use transitions to explain change, not decorate every property.
3. Ensure touch targets and mobile spacing are still comfortable.

### 4. Pressure test the interface

1. Check narrow screens, wide screens, long text, empty content, and error states.
2. Verify contrast and keyboard focus visibility.
3. Remove visual noise that does not help comprehension.

## Quick Reference

| Problem | Default move |
| --- | --- |
| Bland screen | Pick a stronger type, color, and background system |
| Crowded layout | Reduce simultaneous emphasis and restore spacing rhythm |
| Weak CTA | Increase contrast, size, placement clarity, and nearby whitespace |
| Janky feel | Limit animation to a few meaningful transitions |

## Success Criteria

- The interface has a visible design point of view.
- Hierarchy is readable at a glance.
- States remain clear on desktop and mobile.
- Styling supports the product task instead of distracting from it.