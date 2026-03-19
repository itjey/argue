import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIDER_MIN = 20
const SLIDER_MAX = 200
const SLIDER_STEP = 5
const ANNUAL_DISCOUNT = 0.20
const CREDITS_PER_DOLLAR = 1000

const PRESET_PLANS = [
  { monthly: 20 },
  { monthly: 50 },
  { monthly: 100 },
]

// Credits cost per request (after 2× markup on OpenRouter raw pricing).
// Standard request ≈ 500 input + 300 output tokens.
// Reasoning request ≈ 2,000 input + 800 output tokens + reasoning overhead.
const MODELS = [
  { name: 'Gemini 3.1 Pro',   creditsStd: 4,  creditsReason: 18  },
  { name: 'Claude Sonnet 4.6', creditsStd: 12, creditsReason: 55  },
  { name: 'Claude Opus 4.6',   creditsStd: 57, creditsReason: 250 },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.floor(n / 1000)}k`
  return String(n)
}

function fmtCount(budget: number, cost: number): string {
  return fmtCredits(Math.floor(budget / cost))
}

// ── Sub-component: usage rows (shared between cards and custom slider) ────────

function UsageRows({ creditsPerMonth }: { creditsPerMonth: number }) {
  return (
    <div className="pricing-usage-list">
      {MODELS.map((m) => (
        <div key={m.name} className="pricing-usage-item">
          <span className="pricing-usage-item-model">{m.name}</span>
          <span className="pricing-usage-item-counts">
            ~{fmtCount(creditsPerMonth, m.creditsStd)} msgs
            <span className="pricing-usage-item-reason"> · ~{fmtCount(creditsPerMonth, m.creditsReason)} with reasoning</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PricingPage({ onClose }: { onClose: () => void }) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [custom, setCustom] = useState(false)
  const [customMonthly, setCustomMonthly] = useState(50)

  const isAnnual = billing === 'annual'
  const discount = isAnnual ? ANNUAL_DISCOUNT : 0

  const sliderPct = ((customMonthly - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100
  const customEffective = customMonthly * (1 - discount)
  const customCredits = customMonthly * CREDITS_PER_DOLLAR
  const customAnnualTotal = customEffective * 12
  const customSavings = customMonthly * 12 - customAnnualTotal

  return (
    <div className="pricing-page">
      <div className="pricing-page-inner">

        {/* ── Back + header ── */}
        <div className="pricing-page-top">
          <button className="pricing-back-btn" onClick={onClose} type="button">
            <ArrowLeft size={15} />
            Back
          </button>
        </div>

        <div className="pricing-page-heading">
          <h1>Pricing</h1>
          <p>Buy credits, use them on any model. Unused credits roll over.</p>
        </div>

        {/* ── Billing toggle ── */}
        <div className="pricing-billing-toggle">
          <button
            className={`pricing-billing-btn${!isAnnual ? ' pricing-billing-btn-active' : ''}`}
            type="button"
            onClick={() => setBilling('monthly')}
          >
            Monthly
          </button>
          <button
            className={`pricing-billing-btn${isAnnual ? ' pricing-billing-btn-active' : ''}`}
            type="button"
            onClick={() => setBilling('annual')}
          >
            Annual
            <span className="pricing-billing-badge">−20%</span>
          </button>
        </div>

        {/* ── Preset plans or custom slider ── */}
        {!custom ? (
          <div className="pricing-plans-grid">
            {PRESET_PLANS.map(({ monthly }) => {
              const effective = monthly * (1 - discount)
              const credits = monthly * CREDITS_PER_DOLLAR
              const annualTotal = effective * 12
              const savings = monthly * 12 - annualTotal
              return (
                <div key={monthly} className="pricing-plan-card">
                  <div className="pricing-plan-price">
                    <span className="pricing-plan-amount">${isAnnual ? effective.toFixed(0) : monthly}</span>
                    <span className="pricing-plan-period">/mo</span>
                  </div>

                  {isAnnual && (
                    <p className="pricing-plan-annual-note">${annualTotal.toFixed(0)}/year · saves ${savings.toFixed(0)}</p>
                  )}

                  <p className="pricing-plan-credits">{fmtCredits(credits)} credits / month</p>

                  <UsageRows creditsPerMonth={credits} />

                  <button
                    className="pricing-plan-cta"
                    disabled
                    title="Payment integration coming soon"
                    type="button"
                  >
                    Get started · coming soon
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="pricing-custom-section">
            <div className="pricing-slider-section">
              <div className="pricing-slider-labels">
                <span>${SLIDER_MIN}</span>
                <span>${SLIDER_MAX}/mo</span>
              </div>
              <div className="pricing-slider-track-wrap">
                <div className="pricing-slider-fill" style={{ width: `${sliderPct}%` }} />
                <input
                  aria-label="Monthly subscription amount"
                  className="pricing-slider"
                  max={SLIDER_MAX}
                  min={SLIDER_MIN}
                  step={SLIDER_STEP}
                  type="range"
                  value={customMonthly}
                  onChange={(e) => setCustomMonthly(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="pricing-custom-summary">
              <span className="pricing-custom-amount">${isAnnual ? customEffective.toFixed(0) : customMonthly}</span>
              <span className="pricing-custom-period">/month</span>
              <span className="pricing-custom-credits">{fmtCredits(customCredits)} credits</span>
              {isAnnual && (
                <span className="pricing-custom-annual">${customAnnualTotal.toFixed(0)}/year · saves ${customSavings.toFixed(0)}</span>
              )}
            </div>

            <UsageRows creditsPerMonth={customCredits} />

            <button
              className="pricing-plan-cta pricing-custom-cta"
              disabled
              title="Payment integration coming soon"
              type="button"
            >
              Get started · coming soon
            </button>
          </div>
        )}

        {/* ── Footer note ── */}
        <div className="pricing-page-footer">
          {!custom ? (
            <button className="pricing-custom-link" onClick={() => setCustom(true)} type="button">
              or price your own plan instead
            </button>
          ) : (
            <button className="pricing-custom-link" onClick={() => setCustom(false)} type="button">
              ← back to plans
            </button>
          )}
          <p className="pricing-page-footnote">
            Credits are purchased via your Argue account and used across all AI features.
            Estimates assume ~500 input / 300 output tokens per message. Deep reasoning uses ~4–5× more.
          </p>
        </div>

      </div>
    </div>
  )
}
