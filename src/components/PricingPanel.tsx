import { useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIDER_MIN = 20
const SLIDER_MAX = 200
const SLIDER_STEP = 5
const SLIDER_DEFAULT = 50
const ANNUAL_DISCOUNT = 0.20
const CREDITS_PER_DOLLAR = 1000

// Credits cost per request (after 2× markup on OpenRouter raw pricing).
// Standard request ≈ 500 input + 300 output tokens.
// Reasoning request ≈ 2,000 input + 800 output tokens + reasoning overhead.
const MODELS = [
  {
    name: 'Gemini 3.1 Pro',
    tag: 'Fast',
    creditsStd: 4,      // ~$0.004 after markup
    creditsReason: 18,  // ~$0.018 after markup
    desc: 'standard messages',
  },
  {
    name: 'Claude Sonnet 4.6',
    tag: 'Standard',
    creditsStd: 12,
    creditsReason: 55,
    desc: 'standard messages',
  },
  {
    name: 'Claude Opus 4.6',
    tag: 'Premium',
    creditsStd: 57,
    creditsReason: 250,
    desc: 'messages',
  },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function estimateCount(budget: number, creditsPerRequest: number): string {
  const count = Math.floor(budget / creditsPerRequest)
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(0)}k`
  return String(count)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingPanel() {
  const [monthly, setMonthly] = useState(SLIDER_DEFAULT)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')

  const isAnnual = billing === 'annual'
  const effectiveMonthly = isAnnual ? monthly * (1 - ANNUAL_DISCOUNT) : monthly
  const annualTotal = effectiveMonthly * 12
  const annualSavings = monthly * 12 - annualTotal
  const creditsPerMonth = monthly * CREDITS_PER_DOLLAR // credits are based on face value, not discounted price

  const sliderPct = ((monthly - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100

  return (
    <div className="pricing-panel">

      {/* ── Billing toggle ── */}
      <div className="pricing-billing-toggle">
        <button
          className={`pricing-billing-btn${billing === 'monthly' ? ' pricing-billing-btn-active' : ''}`}
          type="button"
          onClick={() => setBilling('monthly')}
        >
          Monthly
        </button>
        <button
          className={`pricing-billing-btn${billing === 'annual' ? ' pricing-billing-btn-active' : ''}`}
          type="button"
          onClick={() => setBilling('annual')}
        >
          Annual
          <span className="pricing-billing-badge">−20%</span>
        </button>
      </div>

      {/* ── Slider ── */}
      <div className="pricing-slider-section">
        <div className="pricing-slider-labels">
          <span className="pricing-slider-label-min">${SLIDER_MIN}</span>
          <span className="pricing-slider-label-max">${SLIDER_MAX}/mo</span>
        </div>
        <div className="pricing-slider-track-wrap">
          <div
            className="pricing-slider-fill"
            style={{ width: `${sliderPct}%` }}
          />
          <input
            aria-label="Monthly subscription amount"
            className="pricing-slider"
            max={SLIDER_MAX}
            min={SLIDER_MIN}
            step={SLIDER_STEP}
            type="range"
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
          />
        </div>
      </div>

      {/* ── Summary card ── */}
      <div className="pricing-summary">
        <div className="pricing-summary-price">
          <span className="pricing-summary-amount">
            ${isAnnual ? effectiveMonthly.toFixed(2) : monthly}
          </span>
          <span className="pricing-summary-period">/month</span>
        </div>

        <div className="pricing-summary-credits">
          <span className="pricing-credits-count">{formatCredits(creditsPerMonth)}</span>
          <span className="pricing-credits-label"> credits / month</span>
        </div>

        {isAnnual && (
          <div className="pricing-summary-annual-note">
            Billed ${annualTotal.toFixed(0)}/year · saves ${annualSavings.toFixed(0)}
          </div>
        )}
      </div>

      {/* ── Usage rows ── */}
      <div className="pricing-usage-section">
        <p className="pricing-usage-heading">What you can do</p>
        <div className="pricing-usage-table">
          {MODELS.map((model) => (
            <div key={model.name} className="pricing-usage-row">
              <div className="pricing-usage-row-left">
                <span className={`pricing-usage-tag pricing-usage-tag-${model.tag.toLowerCase()}`}>
                  {model.tag}
                </span>
                <span className="pricing-usage-model">{model.name}</span>
              </div>
              <div className="pricing-usage-row-right">
                <span className="pricing-usage-count">
                  ~{estimateCount(creditsPerMonth, model.creditsStd)} {model.desc}
                </span>
                <span className="pricing-usage-reasoning">
                  ~{estimateCount(creditsPerMonth, model.creditsReason)} with deep reasoning
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="pricing-usage-footnote">
          Estimates based on typical messages (~500 input / 300 output tokens). Deep reasoning uses ~4–5× more credits.
          Unused credits roll over month to month.
        </p>
      </div>

      {/* ── CTA ── */}
      <button
        className="pricing-cta-btn"
        disabled
        title="Payment integration coming soon — check back shortly"
        type="button"
      >
        Get started · coming soon
      </button>

      <p className="pricing-cta-note">
        Credits are purchased via your Argue account and used across all AI features. No hidden fees.
      </p>
    </div>
  )
}
