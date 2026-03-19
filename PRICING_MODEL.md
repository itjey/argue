# Argue — Pricing Model

This document describes the credit-based pricing model for Argue.

---

## Overview

Argue uses a **pay-what-you-want subscription** model. Users choose a monthly amount between $20 and $200, which is converted into **credits** that are spent on AI usage across all features (Chat, Debate, LaTeX).

There is no fixed tier — users control how much they pay and what they get.

---

## Credits

| Unit | Value |
|---|---|
| 1 credit | $0.001 of AI cost charged to the user |
| 1,000 credits | $1.00 |
| $X/month subscription | X × 1,000 credits / month |

**Example:** A $50/month subscription provides 50,000 credits per month.

Credits roll over month to month and never expire as long as the account is active.

---

## Provider Markup

Argue purchases API capacity from [OpenRouter](https://openrouter.ai) and bills users at **2× the raw OpenRouter rate**. This results in approximately 50% gross margin on all AI usage.

**Example (input tokens):**
- OpenRouter charges Argue: $0.000003/token
- Argue charges the user: $0.000006/token (= 0.006 credits/token)

This markup covers operating costs, server infrastructure, and product development.

---

## Model Reference Pricing (March 2026, after 2× markup)

Assumes a standard request: ~500 input tokens + ~300 output tokens.  
Extended reasoning: ~2,000 input tokens + ~800 output tokens (plus reasoning overhead).

| Model | Input $/M tokens | Output $/M tokens | Credits / std request | Credits / reasoning request |
|---|---|---|---|---|
| Gemini 3.1 Pro | $4 | $16 | ~4 | ~18 |
| Claude Sonnet 4.6 | $6 | $30 | ~12 | ~55 |
| Claude Opus 4.6 | $30 | $150 | ~57 | ~250 |
| GPT-5.4 | $20 | $60 | ~28 | ~125 |

> **Note:** These are estimates. Actual token counts vary by conversation length and model behaviour. Prices will be updated as OpenRouter adjusts rates.

---

## Usage Estimates by Subscription Level

| Monthly plan | Gemini 3.1 Pro (std) | Claude Sonnet 4.6 (std) | Opus 4.6 + reasoning |
|---|---|---|---|
| $20 → 20,000 cr | ~5,000 messages | ~1,650 messages | ~80 sessions |
| $50 → 50,000 cr | ~12,500 messages | ~4,100 messages | ~200 sessions |
| $100 → 100,000 cr | ~25,000 messages | ~8,300 messages | ~400 sessions |
| $200 → 200,000 cr | ~50,000 messages | ~16,600 messages | ~800 sessions |

---

## Annual Billing Discount

Users may choose to pay annually and receive a **20% discount** on the monthly price. Credits per month remain unchanged — the discount applies only to the billed amount.

**Example at $50/month:**
- Monthly billing: $50/month = $600/year
- Annual billing: $40/month = $480/year (saves $120)
- Credits received: 50,000/month in both cases

---

## Slider UI

The pricing dialog presents a slider from **$20 to $200/month** in $5 increments, defaulting to $50. Users toggle between monthly and annual billing. All credit calculations update live.

The "Get Started" button is disabled pending Stripe payment integration.

---

## Future: Payment Integration

Payment will be handled via **Stripe**. The planned flow:

1. User selects amount + billing period on the pricing slider
2. Clicks "Get Started" → redirected to Stripe Checkout
3. On successful payment → Argue backend is notified via Stripe webhook
4. Credits are added to the user's Firestore balance
5. Each API call deducts the appropriate credit amount in real time

**Pending work:**
- Stripe product + price creation (one per $5 increment, or dynamic pricing)
- Webhook handler on the server (`/webhook/stripe`)
- Firestore `users/{uid}/balance` field
- Middleware in `cloudflare/worker.ts` and `server/index.mjs` to gate API calls by balance
- Credit deduction logic keyed to model pricing

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Currency name | credits | Simple, neutral, widely understood |
| Denomination | 1 credit = $0.001 | Fine-grained enough for cheap models, readable for users |
| Markup | 2× OpenRouter raw | Covers costs, easy to reason about |
| Annual discount | 20% | Common SaaS standard; roughly "2 months free" |
| Slider range | $20–$200/month | Covers casual to heavy power users; aligns with major AI subscription services |
| Unused credits | Roll over | Reduces friction and churn |
