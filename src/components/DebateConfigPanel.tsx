import { useState } from 'react'
import { ChevronDown, Plus, Search, Trash2, X } from 'lucide-react'
import type { OpenRouterModel } from '../lib/openrouter'
import {
  DEFAULT_DEBATE_CONFIG,
  PREDEFINED_ROLES,
  validateDebateConfig,
  type DebateConfig,
  type DebateParticipant,
  type SynthesisMode,
} from '../lib/debateConfig'

interface DebateConfigPanelProps {
  config: DebateConfig
  models: OpenRouterModel[]
  onChange: (config: DebateConfig) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function DebateConfigPanel({ config, models, onChange, collapsed, onToggleCollapse }: DebateConfigPanelProps) {
  const [modelSearches, setModelSearches] = useState<Record<string, string>>({})
  const [openModelDropdown, setOpenModelDropdown] = useState<string | null>(null)
  const [judgeSearch, setJudgeSearch] = useState('')
  const [judgeDropdownOpen, setJudgeDropdownOpen] = useState(false)

  const errors = validateDebateConfig(config)

  function updateParticipant(index: number, updates: Partial<DebateParticipant>) {
    const next = [...config.participants]
    next[index] = { ...next[index], ...updates }
    onChange({ ...config, participants: next })
  }

  function addParticipant() {
    const id = `p${Date.now()}`
    const newParticipant: DebateParticipant = {
      id,
      modelId: '',
      alias: `Model ${config.participants.length + 1}`,
      role: 'builder',
    }
    onChange({ ...config, participants: [...config.participants, newParticipant] })
  }

  function removeParticipant(index: number) {
    if (config.participants.length <= 2) return
    const next = config.participants.filter((_, i) => i !== index)
    onChange({ ...config, participants: next })
  }

  function filterModels(search: string) {
    if (!search.trim()) return models
    const q = search.toLowerCase()
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    )
  }

  if (collapsed) {
    return (
      <div className="debate-config-collapsed">
        <button
          className="debate-config-expand-btn"
          type="button"
          onClick={onToggleCollapse}
        >
          <ChevronDown size={14} />
          <span>Configure debate ({config.participants.length} models, {config.roundCount} round{config.roundCount !== 1 ? 's' : ''})</span>
        </button>
      </div>
    )
  }

  return (
    <div className="debate-config-panel">
      <div className="debate-config-header">
        <h3 className="debate-config-title">Debate Configuration</h3>
        {onToggleCollapse && (
          <button className="debate-config-collapse-btn" type="button" onClick={onToggleCollapse}>
            <X size={14} />
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="debate-config-errors">
          {errors.map((err, i) => (
            <p key={i} className="debate-config-error">{err}</p>
          ))}
        </div>
      )}

      {/* Participants */}
      <section className="debate-config-section">
        <div className="debate-config-section-header">
          <span className="debate-config-section-label">Participants</span>
          <button className="debate-config-add-btn" type="button" onClick={addParticipant}>
            <Plus size={13} />
            <span>Add</span>
          </button>
        </div>

        <div className="debate-config-participants">
          {config.participants.map((participant, index) => {
            const searchKey = participant.id
            const search = modelSearches[searchKey] ?? ''
            const isDropdownOpen = openModelDropdown === searchKey
            const filteredList = filterModels(search)
            const selectedModelName = models.find((m) => m.id === participant.modelId)?.name

            return (
              <div key={participant.id} className="debate-config-participant">
                <div className="debate-config-participant-row">
                  <input
                    className="debate-config-alias-input"
                    value={participant.alias}
                    onChange={(e) => updateParticipant(index, { alias: e.target.value })}
                    placeholder="Alias"
                  />
                  {config.participants.length > 2 && (
                    <button
                      className="debate-config-remove-btn"
                      type="button"
                      onClick={() => removeParticipant(index)}
                      title="Remove participant"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Model selector */}
                <div className="model-selector debate-config-model-selector">
                  <button
                    className="model-selector-trigger"
                    type="button"
                    onClick={() => setOpenModelDropdown(isDropdownOpen ? null : searchKey)}
                  >
                    <span className="model-selector-name">
                      {selectedModelName ?? (participant.modelId || 'Select model')}
                    </span>
                    <ChevronDown size={13} />
                  </button>

                  {isDropdownOpen && (
                    <div className="model-dropdown">
                      <div className="model-search-wrap">
                        <Search size={13} className="model-search-icon" />
                        <input
                          className="model-search-input"
                          placeholder="Search models…"
                          value={search}
                          onChange={(e) => setModelSearches({ ...modelSearches, [searchKey]: e.target.value })}
                          autoFocus
                        />
                      </div>
                      <div className="model-list">
                        {filteredList.slice(0, 50).map((m) => (
                          <div key={m.id} className={`model-list-item${participant.modelId === m.id ? ' model-list-item-active' : ''}`}>
                            <button
                              className="model-list-select"
                              type="button"
                              onClick={() => {
                                updateParticipant(index, { modelId: m.id })
                                setOpenModelDropdown(null)
                                setModelSearches({ ...modelSearches, [searchKey]: '' })
                              }}
                            >
                              <span className="model-list-name">{m.name}</span>
                              <span className="model-list-id">{m.id}</span>
                            </button>
                          </div>
                        ))}
                        {filteredList.length === 0 && (
                          <p className="model-list-empty">No models found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Role selector */}
                <select
                  className="debate-config-role-select"
                  value={PREDEFINED_ROLES.find((r) => participant.role.includes(r.id))?.id ?? 'custom'}
                  onChange={(e) => {
                    const role = PREDEFINED_ROLES.find((r) => r.id === e.target.value)
                    if (role) {
                      updateParticipant(index, { role: role.systemPromptFragment })
                    }
                  }}
                >
                  {PREDEFINED_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                  <option value="custom">Custom</option>
                </select>

                {/* Token budget */}
                <div className="debate-config-budget-row">
                  <label className="debate-config-budget-label">Token budget</label>
                  <input
                    className="debate-config-budget-input"
                    type="number"
                    min={0}
                    max={100000}
                    step={1000}
                    placeholder="Auto"
                    value={participant.tokenBudget ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined
                      updateParticipant(index, { tokenBudget: val })
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Round controls */}
      <section className="debate-config-section">
        <span className="debate-config-section-label">Round Controls</span>

        <div className="debate-config-row">
          <label className="debate-config-label">Rounds</label>
          <input
            className="debate-config-number-input"
            type="number"
            min={1}
            max={5}
            value={config.roundCount}
            onChange={(e) => onChange({ ...config, roundCount: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
          />
        </div>

        <div className="debate-config-row">
          <label className="debate-config-label">Self-critique</label>
          <button
            className={`debate-config-toggle${config.enableSelfCritique ? ' debate-config-toggle-on' : ''}`}
            type="button"
            onClick={() => onChange({ ...config, enableSelfCritique: !config.enableSelfCritique })}
          >
            {config.enableSelfCritique ? 'On' : 'Off'}
          </button>
        </div>

        <div className="debate-config-row">
          <label className="debate-config-label">Cross-critique</label>
          <button
            className={`debate-config-toggle${config.enableCrossCritique ? ' debate-config-toggle-on' : ''}`}
            type="button"
            onClick={() => onChange({ ...config, enableCrossCritique: !config.enableCrossCritique })}
          >
            {config.enableCrossCritique ? 'On' : 'Off'}
          </button>
        </div>

        <div className="debate-config-row">
          <label className="debate-config-label">Per-round token budget</label>
          <input
            className="debate-config-number-input"
            type="number"
            min={0}
            max={100000}
            step={1000}
            placeholder="Auto"
            value={config.perRoundTokenBudget ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : undefined
              onChange({ ...config, perRoundTokenBudget: val })
            }}
          />
        </div>
      </section>

      {/* Synthesis controls */}
      <section className="debate-config-section">
        <span className="debate-config-section-label">Synthesis</span>

        <div className="debate-config-row">
          <label className="debate-config-label">Mode</label>
          <div className="debate-config-radio-group">
            {(['vote', 'merge', 'judge-pick'] as SynthesisMode[]).map((mode) => (
              <label key={mode} className="debate-config-radio">
                <input
                  type="radio"
                  name="synthesisMode"
                  value={mode}
                  checked={config.synthesisMode === mode}
                  onChange={() => onChange({ ...config, synthesisMode: mode })}
                />
                <span>{mode === 'judge-pick' ? 'Judge pick' : mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Judge model selector */}
        <div className="debate-config-row">
          <label className="debate-config-label">Judge model</label>
          <div className="model-selector debate-config-model-selector">
            <button
              className="model-selector-trigger"
              type="button"
              onClick={() => setJudgeDropdownOpen(!judgeDropdownOpen)}
            >
              <span className="model-selector-name">
                {models.find((m) => m.id === config.judgeModelId)?.name ?? (config.judgeModelId || 'Select judge')}
              </span>
              <ChevronDown size={13} />
            </button>

            {judgeDropdownOpen && (
              <div className="model-dropdown">
                <div className="model-search-wrap">
                  <Search size={13} className="model-search-icon" />
                  <input
                    className="model-search-input"
                    placeholder="Search models…"
                    value={judgeSearch}
                    onChange={(e) => setJudgeSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="model-list">
                  {filterModels(judgeSearch).slice(0, 50).map((m) => (
                    <div key={m.id} className={`model-list-item${config.judgeModelId === m.id ? ' model-list-item-active' : ''}`}>
                      <button
                        className="model-list-select"
                        type="button"
                        onClick={() => {
                          onChange({ ...config, judgeModelId: m.id })
                          setJudgeDropdownOpen(false)
                          setJudgeSearch('')
                        }}
                      >
                        <span className="model-list-name">{m.name}</span>
                        <span className="model-list-id">{m.id}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export { DebateConfigPanel, DEFAULT_DEBATE_CONFIG }
