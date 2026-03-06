import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BrainCircuit,
  Braces,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  FileOutput,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessagesSquare,
  Orbit,
  ScrollText,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from 'lucide-react'
import './App.css'

type FeatureCard = {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
}

type FlowStep = {
  icon: LucideIcon
  title: string
  description: string
}

type Metric = {
  value: string
  label: string
  detail: string
}

type Model = {
  icon: LucideIcon
  name: string
  specialty: string
  tone: string
}

type Message = {
  icon: LucideIcon
  speaker: string
  role: string
  text: string
}

const metrics: Metric[] = [
  {
    value: '4-room',
    label: 'collaboration suite',
    detail: 'Reasoning, coding, math, and critique work in parallel.',
  },
  {
    value: 'BYO',
    label: 'provider keys',
    detail: 'Connect your own model accounts and keep spend under control.',
  },
  {
    value: '1 trace',
    label: 'decision history',
    detail: 'Every challenge, rebuttal, and synthesis stays visible.',
  },
]

const featureCards: FeatureCard[] = [
  {
    icon: Code2,
    eyebrow: 'Programming',
    title: 'Assign implementation, review, and debugging as separate voices.',
    description:
      'Set one model to architect, another to write, and a third to attack edge cases before anything ships.',
  },
  {
    icon: Sigma,
    eyebrow: 'Math',
    title: 'Let proof-oriented models pressure test every intermediate step.',
    description:
      'Argue keeps symbolic thinking, numerical checks, and dissent together so the final answer survives scrutiny.',
  },
  {
    icon: ScrollText,
    eyebrow: 'Strategy',
    title: 'Turn vague briefs into structured decisions with evidence trails.',
    description:
      'Research, synthesis, and executive framing happen in one calm room instead of scattered tabs and chats.',
  },
]

const flowSteps: FlowStep[] = [
  {
    icon: KeyRound,
    title: 'Bring your own keys',
    description:
      'Paste provider credentials once, define guardrails, and keep model choice entirely in your hands.',
  },
  {
    icon: Layers3,
    title: 'Compose the room',
    description:
      'Invite specialists for reasoning, generation, critique, and verification into the same focused workspace.',
  },
  {
    icon: MessagesSquare,
    title: 'Let them challenge each other',
    description:
      'Arguments are explicit. Conflicts surface early. Better answers emerge because disagreement is designed in.',
  },
  {
    icon: FileOutput,
    title: 'Export the final position',
    description:
      'Ship a clean synthesis with accepted steps, rejected branches, and a polished handoff for the human owner.',
  },
]

const trustPoints: FlowStep[] = [
  {
    icon: LockKeyhole,
    title: 'User-controlled credentials',
    description:
      'Provider access feels deliberate and premium, with the interface designed around calm control rather than clutter.',
  },
  {
    icon: ShieldCheck,
    title: 'Clear operational boundaries',
    description:
      'Every model can be scoped by job, tone, and visibility, so collaborative power never turns into chaos.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Adjustable collaboration depth',
    description:
      'Run a fast consensus for small work or a longer structured debate for difficult tasks without leaving the page.',
  },
]

const models: Model[] = [
  {
    icon: BrainCircuit,
    name: 'Reasoning Lead',
    specialty: 'Frames the problem and questions assumptions.',
    tone: 'Calm, skeptical, exact',
  },
  {
    icon: Braces,
    name: 'Code Partner',
    specialty: 'Designs implementation paths and catches integration risk.',
    tone: 'Practical, structured',
  },
  {
    icon: Sigma,
    name: 'Proof Engine',
    specialty: 'Checks math, logic, and constraint satisfaction.',
    tone: 'Formal, methodical',
  },
]

const thread: Message[] = [
  {
    icon: BrainCircuit,
    speaker: 'Reasoning Lead',
    role: 'Sets the frame',
    text: 'The shortest path is not automatically the safest path. We should compare latency, reliability, and maintainability before choosing an architecture.',
  },
  {
    icon: Braces,
    speaker: 'Code Partner',
    role: 'Counters with implementation detail',
    text: 'Agreed, but the current spec rewards simplicity. A thinner service layer lowers surface area while still leaving room for extensibility.',
  },
  {
    icon: Sigma,
    speaker: 'Proof Engine',
    role: 'Tests the logic',
    text: 'The conclusion holds only if retry cost stays bounded. We should model failure bursts before accepting the simpler design outright.',
  },
]

function App() {
  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Argue home">
          <span className="brand-mark">
            <Orbit size={18} />
          </span>
          <span className="brand-wordmark">Argue</span>
        </a>

        <nav className="nav" aria-label="Primary navigation">
          <a href="#concept">Concept</a>
          <a href="#workflow">Workflow</a>
          <a href="#interface">Interface</a>
          <a href="#trust">Trust</a>
        </nav>

        <a
          className="topbar-cta"
          href="https://github.com/itjey/argue"
          target="_blank"
          rel="noreferrer"
        >
          Repository
          <ArrowUpRight size={16} />
        </a>
      </header>

      <main className="page" id="top">
        <section className="hero section" id="concept">
          <div className="hero-copy">
            <div className="eyebrow-row">
              <span className="eyebrow-pill">
                <Sparkles size={14} />
                Collaborative LLM orchestration
              </span>
              <span className="eyebrow-subtle">Designed for calm, difficult work</span>
            </div>

            <h1>Let your models argue until the clearest answer survives.</h1>
            <p className="hero-text">
              Argue is a premium multi-model workspace for professionals who want
              sharper thinking, not noisier automation. Choose the models, assign
              the roles, paste your own API keys, and let specialists challenge
              each other across programming, math, research, and planning.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#workflow">
                Explore the flow
                <ArrowRight size={18} />
              </a>
              <a className="button button-secondary" href="#interface">
                See the interface
                <ChevronRight size={18} />
              </a>
            </div>

            <div className="metric-grid">
              {metrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <p className="metric-value">{metric.value}</p>
                  <h2>{metric.label}</h2>
                  <p>{metric.detail}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            <div className="workspace-shell">
              <div className="workspace-header">
                <div>
                  <p className="workspace-label">Live session</p>
                  <h2>Boardroom for frontier models</h2>
                </div>
                <div className="status-pill">
                  <BadgeCheck size={16} />
                  Synthesis in progress
                </div>
              </div>

              <div className="workspace-grid">
                <aside className="workspace-sidebar">
                  <div className="panel-card">
                    <p className="panel-label">Prompt brief</p>
                    <h3>Design a resilient architecture for a high-trust AI product.</h3>
                    <div className="chip-row">
                      <span>Code review</span>
                      <span>Math check</span>
                      <span>Tradeoff debate</span>
                    </div>
                  </div>

                  <div className="panel-card">
                    <p className="panel-label">Room roster</p>
                    <div className="roster-list">
                      {models.map((model) => {
                        const Icon = model.icon

                        return (
                          <article className="roster-item" key={model.name}>
                            <span className="roster-icon">
                              <Icon size={18} />
                            </span>
                            <div>
                              <h3>{model.name}</h3>
                              <p>{model.specialty}</p>
                              <small>{model.tone}</small>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </aside>

                <div className="workspace-stage">
                  <div className="thread-stack">
                    {thread.map((message) => {
                      const Icon = message.icon

                      return (
                        <article className="thread-card" key={message.speaker}>
                          <div className="thread-icon">
                            <Icon size={18} />
                          </div>
                          <div className="thread-body">
                            <div className="thread-meta">
                              <h3>{message.speaker}</h3>
                              <span>{message.role}</span>
                            </div>
                            <p>{message.text}</p>
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  <div className="verdict-card">
                    <div className="verdict-header">
                      <div>
                        <p className="panel-label">Accepted position</p>
                        <h3>Ship the simple path, but prove the failure model first.</h3>
                      </div>
                      <div className="verdict-score">
                        <Clock3 size={16} />
                        12 min debate
                      </div>
                    </div>

                    <div className="verdict-grid">
                      <div>
                        <p className="mini-label">Chosen approach</p>
                        <p className="mini-text">
                          Lean service layer with explicit retry controls and a
                          verification pass before rollout.
                        </p>
                      </div>
                      <div>
                        <p className="mini-label">Rejected branch</p>
                        <p className="mini-text">
                          Fully abstracted orchestration added flexibility, but the
                          maintenance cost was too high for the current scope.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="capabilities-title">
          <div className="section-heading">
            <p className="section-kicker">Use cases</p>
            <h2 id="capabilities-title">
              Built for professionals who need precision more than novelty.
            </h2>
            <p className="section-copy">
              The design language is restrained on purpose. Argue should feel like
              a private suite for deep work, not a dashboard shouting for attention.
            </p>
          </div>

          <div className="feature-grid">
            {featureCards.map((feature) => {
              const Icon = feature.icon

              return (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-icon">
                    <Icon size={20} />
                  </div>
                  <p className="feature-eyebrow">{feature.eyebrow}</p>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="section workflow-section" id="workflow">
          <div className="section-heading section-heading-compact">
            <p className="section-kicker">Workflow</p>
            <h2>Structure disagreement, then make the final decision readable.</h2>
          </div>

          <div className="timeline-grid">
            {flowSteps.map((step, index) => {
              const Icon = step.icon

              return (
                <article className="timeline-card" key={step.title}>
                  <div className="timeline-top">
                    <span className="timeline-index">{`0${index + 1}`}</span>
                    <span className="timeline-icon">
                      <Icon size={18} />
                    </span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="section interface-section" id="interface">
          <div className="split-layout">
            <div className="split-copy">
              <p className="section-kicker">Interface</p>
              <h2>A warm, modern command surface for serious multi-model work.</h2>
              <p className="section-copy">
                Every panel is tuned for clarity. No wasted chrome. No cramped
                controls. Just enough softness, depth, and amber light to make
                long sessions feel focused instead of cold.
              </p>

              <div className="trust-list">
                {trustPoints.map((point) => {
                  const Icon = point.icon

                  return (
                    <article className="trust-item" key={point.title}>
                      <span className="trust-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3>{point.title}</h3>
                        <p>{point.description}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            <div className="control-surface" aria-label="Argue settings preview">
              <div className="control-card control-card-primary">
                <div className="control-card-header">
                  <div>
                    <p className="panel-label">Provider vault</p>
                    <h3>Connect your models once</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>

                <div className="provider-list">
                  <div className="provider-row">
                    <span>OpenAI</span>
                    <strong>Connected</strong>
                  </div>
                  <div className="provider-row">
                    <span>Anthropic</span>
                    <strong>Connected</strong>
                  </div>
                  <div className="provider-row">
                    <span>Google</span>
                    <strong>Connected</strong>
                  </div>
                  <div className="provider-row">
                    <span>Mistral</span>
                    <strong>Ready</strong>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <div className="control-card-header">
                  <div>
                    <p className="panel-label">Room settings</p>
                    <h3>Deliberate orchestration</h3>
                  </div>
                  <Workflow size={18} />
                </div>

                <div className="setting-row">
                  <span>Debate depth</span>
                  <span>Focused</span>
                </div>
                <div className="setting-row">
                  <span>Critique pass</span>
                  <span>Required</span>
                </div>
                <div className="setting-row">
                  <span>Final summary</span>
                  <span>Executive format</span>
                </div>
              </div>

              <div className="control-card control-card-accent">
                <p className="panel-label">Result</p>
                <h3>One elegant thread from prompt to final position.</h3>
                <p className="control-copy">
                  Argue is designed to feel expensive because expensive products
                  protect attention. The interface should look composed even when
                  the thinking underneath is intense.
                </p>
                <div className="chip-row">
                  <span>Private trace</span>
                  <span>Role-based models</span>
                  <span>Export ready</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section trust-section" id="trust">
          <div className="cta-card">
            <div className="cta-copy">
              <p className="section-kicker">Positioning</p>
              <h2>A premium frontend for people who treat AI tooling like infrastructure.</h2>
              <p>
                This concept leans into a refined brown palette, Lucide-only iconography,
                tight spatial rhythm, and responsive balance across desktop, tablet,
                and mobile. It feels soft and welcoming, but still exact.
              </p>
            </div>

            <div className="cta-points">
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>GitHub Pages ready</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Single cohesive amber-brown palette</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Responsive by design</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
