import { useEffect, useState } from 'react'
import { Loader, Save, Trash2 } from 'lucide-react'
import type { DebateConfig } from '../lib/debateConfig'
import {
  deleteDebateTemplate,
  loadDebateTemplates,
  saveDebateTemplate,
  type DebateTemplate,
} from '../lib/debateTemplates'

interface TemplateManagerProps {
  userId: string
  currentConfig: DebateConfig
  onLoadTemplate: (config: DebateConfig) => void
}

function TemplateManager({ userId, currentConfig, onLoadTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<DebateTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    loadDebateTemplates(userId)
      .then(setTemplates)
      .catch(() => setError('Could not load templates.'))
      .finally(() => setLoading(false))
  }, [userId])

  async function handleSave() {
    const name = newName.trim()
    if (!name) return

    setSaving(true)
    setError('')

    try {
      const id = await saveDebateTemplate(userId, { name, config: currentConfig })
      setTemplates((prev) => [
        { id, name, config: currentConfig, createdAt: new Date(), updatedAt: new Date() },
        ...prev,
      ])
      setNewName('')
    } catch {
      setError('Could not save template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(templateId: string) {
    try {
      await deleteDebateTemplate(userId, templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    } catch {
      setError('Could not delete template.')
    }
  }

  return (
    <div className="template-manager">
      <div className="template-manager-header">
        <span className="debate-config-section-label">Templates</span>
      </div>

      {error && <p className="debate-config-error">{error}</p>}

      <div className="template-manager-save">
        <input
          className="debate-config-alias-input"
          placeholder="Template name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button
          className="debate-config-add-btn"
          type="button"
          disabled={!newName.trim() || saving}
          onClick={handleSave}
        >
          {saving ? <Loader size={13} className="code-run-spinner" /> : <Save size={13} />}
          <span>Save</span>
        </button>
      </div>

      {loading ? (
        <div className="template-manager-loading">
          <Loader size={14} className="code-run-spinner" />
          <span>Loading templates…</span>
        </div>
      ) : templates.length === 0 ? (
        <p className="template-manager-empty">No saved templates yet.</p>
      ) : (
        <div className="template-manager-list">
          {templates.map((t) => (
            <div key={t.id} className="template-manager-item">
              <button
                className="template-manager-load"
                type="button"
                onClick={() => onLoadTemplate(t.config)}
              >
                <span className="template-manager-name">{t.name}</span>
                <span className="template-manager-meta">
                  {t.config.participants.length} models · {t.config.roundCount} round{t.config.roundCount !== 1 ? 's' : ''}
                </span>
              </button>
              <button
                className="debate-config-remove-btn"
                type="button"
                onClick={() => handleDelete(t.id)}
                title="Delete template"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { TemplateManager }
