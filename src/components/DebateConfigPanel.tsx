import { useState } from 'react'
import { ChevronDown, Plus, Search, Trash2, X } from 'lucide-react'
import type { OpenRouterModel } from '../lib/openrouter'
import { getProviderLogoUrl, providerNeedsInvert } from '../lib/providerLogos'
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
        <h3 className="debate-config-title">Models</h3>
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

      <section className="debate-config-section">
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
                  <div className="debate-config-model-search-combo">
                    {!isDropdownOpen && participant.modelId ? (
                      <img
                        className={`debate-config-model-logo${providerNeedsInvert(participant.modelId) ? ' model-list-logo-invert' : ''}`}
                        src={getProviderLogoUrl(participant.modelId)}
                        alt=""
                        width={14}
                        height={14}
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <Search size={13} className="debate-config-search-icon" />
                    )}
                    <input
                      className="debate-config-model-input"
                      placeholder="Search models…"
                      value={isDropdownOpen ? search : (selectedModelName ?? '')}
                      onChange={(e) => {
                        setModelSearches({ ...modelSearches, [searchKey]: e.target.value })
                        if (!isDropdownOpen) setOpenModelDropdown(searchKey)
                      }}
                      onFocus={() => {
                        setOpenModelDropdown(searchKey)
                        setModelSearches({ ...modelSearches, [searchKey]: '' })
                      }}
                    />
                  </div>
                  {config.participants.length > 2 && (
                    <button
                      className="debate-config-remove-btn"
                      type="button"
                      onClick={() => removeParticipant(index)}
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {isDropdownOpen && (
                  <div className="debate-config-model-results">
                    {filteredList.slice(0, 50).map((m) => (
                      <button
                        key={m.id}
                        className={`debate-config-model-result${participant.modelId === m.id ? ' debate-config-model-result-active' : ''}`}
                        type="button"
                        onClick={() => {
                          updateParticipant(index, { modelId: m.id, alias: m.name })
                          setOpenModelDropdown(null)
                          setModelSearches({ ...modelSearches, [searchKey]: '' })
                        }}
                      >
                        <img
                          className={`debate-config-model-result-logo${providerNeedsInvert(m.id) ? ' model-list-logo-invert' : ''}`}
                          src={getProviderLogoUrl(m.id)}
                          alt=""
                          width={14}
                          height={14}
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <span className="debate-config-model-result-name">{m.name}</span>
                      </button>
                    ))}
                    {filteredList.length === 0 && (
                      <p className="debate-config-model-empty">No models found</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button className="debate-config-add-btn" type="button" onClick={addParticipant}>
          <Plus size={13} />
          <span>Add model</span>
        </button>
      </section>

      <section className="debate-config-section">
        <div className="debate-config-row">
          <span className="debate-config-label">Rounds</span>
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
          <span className="debate-config-label">Synthesis</span>
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
                <span>{mode === 'judge-pick' ? 'Judge' : mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export { DebateConfigPanel, DEFAULT_DEBATE_CONFIG }
