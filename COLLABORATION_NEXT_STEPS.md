# Collaboration Next Steps

## Current State

The app now runs a real multi-model collaboration workspace instead of a single centered chat.

Shipped behavior:

- GPT-5.4, Gemini 3.1, and DeepSeek R1 can participate in the same run.
- Each model gets its own live panel with streamed reasoning when the provider exposes it.
- Final answer text streams separately from reasoning.
- Each round parses structured tags instead of relying on loose prose.
- Audit, vote, and synthesis stages are visible in the UI.
- The Python collaboration runner and the React UI now use the same collaboration structure.

Important constraint:

- GPT and Gemini reasoning visibility still depends on what OpenRouter exposes for that model and provider route.
- DeepSeek R1 is currently the most reliable visible-thinking participant.
- GPT-5.4 often exposes protected reasoning summaries rather than raw chain-of-thought. The UI should display what is actually returned, not pretend hidden tokens are visible.

## What Was Learned From Live Testing

Real provider behavior is inconsistent across models:

- GPT-5.4 can expose provider reasoning summaries, but not always full raw reasoning text.
- Gemini 3.1 can expose visible reasoning text, but formatting can drift mid-round.
- DeepSeek R1 exposes visible reasoning more reliably, but can overproduce text before tagged output.
- Some providers emit malformed tags such as spaced tag names. The parser now tolerates that.

This means collaboration quality depends on both prompting and output normalization, not just model intelligence.

## Highest-Priority Next Work

### 1. Move off Chat Completions and onto the Responses API

Why:

- GPT and Gemini reasoning events are much better represented in responses-style streaming than in older chat delta streams.
- It will reduce the amount of best-effort parsing needed for reasoning details.
- It gives cleaner separation between reasoning events, text output, tool calls, and final answer boundaries.

Concrete tasks:

- Add a `createOpenRouterResponseStream` transport in `src/lib/openrouter.ts`.
- Add typed event handling for reasoning, text, refusal, and tool events.
- Switch `CollaborationWorkspace.tsx` to use response events for participant steps.
- Mirror the same transport in `collabration/collab.py`.

### 2. Tighten structured output contracts

Why:

- The current parser is resilient, but it still has to recover from provider formatting drift.
- Better constraints will reduce failure rates in later rounds.

Concrete tasks:

- Add model-specific formatting adapters for GPT, Gemini, and DeepSeek.
- Add retry-on-parse-failure for malformed rounds.
- Reject empty critical tags such as `draft_answer`, `confidence`, and `decision`.
- Record parse failures in UI state so users can see when a round is degraded.

### 3. Add persistence and replay

Why:

- Collaboration runs are valuable artifacts.
- Users should be able to inspect a finished debate without rerunning expensive calls.

Concrete tasks:

- Persist completed collaboration runs in Firestore or another backing store.
- Save per-round reasoning, parsed tags, token usage, and synthesis output.
- Add a replay mode that can step through a previous run without hitting OpenRouter again.
- Add export as JSON and Markdown transcript.

### 4. Add first-class evaluation and scoring

Why:

- Right now the workflow is collaborative, but it does not yet produce robust comparative metrics.
- The app should tell the user which model was strongest and why.

Concrete tasks:

- Track per-round confidence deltas.
- Track audit penalties, factual errors, unsupported claims, and reversals.
- Compute a simple scorecard for each participant across the run.
- Surface a final leaderboard for the current conversation.

## Next UI Improvements

### Stream clarity

- Separate reasoning and answer streams more visually.
- Make the current phase obvious at all times.
- Add a compact "reasoning exposed / summarized / hidden" badge per model.
- Collapse long reasoning by default after a round completes.

### Operator controls

- Let the user choose participant models directly.
- Let the user choose the judge separately.
- Add per-model reasoning effort and token budgets.
- Add a round-count selector.
- Add an "aggressive adversarial mode" toggle for harsher critiques.

### Failure handling

- Show parse warnings inline instead of silently recovering.
- Show provider/model failures per participant without breaking the whole run.
- Allow retrying just one failed participant in a round.

## Subagent Architecture

This is the most interesting next major feature.

Goal:

- Each main participant model gets its own small team of worker agents before it submits its main answer.

Example design:

- GPT-5.4 main agent
  - worker A: factual check
  - worker B: alternative approach
  - worker C: edge-case attack
- Gemini 3.1 main agent
  - worker A: retrieval or grounding pass
  - worker B: structure and decomposition
  - worker C: contradiction search
- DeepSeek R1 main agent
  - worker A: math or logic derivation
  - worker B: simplification pass
  - worker C: skeptical verification

Recommended implementation path:

1. Add an internal "worker phase" before `draft`.
2. Give each participant a shared scratchpad plus 2-3 worker prompts.
3. Require the main participant to cite which worker findings changed its answer.
4. Keep worker outputs hidden by default but expandable in the UI.
5. Add token ceilings so worker fan-out does not explode cost.

Risks:

- Costs can multiply quickly.
- Without strict structure, workers can just generate more noise.
- The main participant still needs a strong merge prompt or the subagents will not improve answer quality.

## Testing Plan

### Immediate

- Add fixture tests for tag parsing in TypeScript and Python.
- Add transcript snapshots for known collaboration runs.
- Add a smoke test for one live collaboration run behind an environment variable gate.

### Short term

- Add model compatibility tests for GPT-5.4, Gemini 3.1, and DeepSeek R1.
- Record whether reasoning arrived as visible text, provider summary, or not at all.
- Track malformed-tag rate by model.

### Long term

- Build a benchmark suite of prompts across math, coding, factual, planning, and adversarial domains.
- Compare single-model answers vs collaboration answers.
- Measure whether collaboration actually improves correctness and not just verbosity.

## Product / Security Work

- Move OpenRouter calls behind a server or edge function. The current client-side key flow is fine for local testing but not acceptable for a serious deployed product.
- Add per-user rate limiting and token accounting.
- Add saved presets for common rooms such as "reasoning trio", "coding trio", and "research trio".
- Add collaboration templates for debugging, architecture review, and writing.

## Recommended Order

1. Responses API transport
2. Retry + parse hardening
3. Persistence + replay
4. Per-model controls
5. Scorecards and evaluations
6. Subagent architecture
7. Server-side OpenRouter proxy

## Definition of Done For The Next Milestone

The next milestone should be considered complete when:

- GPT, Gemini, and DeepSeek all stream whatever reasoning the provider exposes in a consistent event model.
- A malformed tagged response can be retried automatically.
- Users can replay a finished collaboration without paying for another run.
- The UI clearly distinguishes reasoning, answer text, audit result, and final synthesis.
- The system can prove with saved benchmarks that collaboration improves outcomes on at least one measurable task category.
