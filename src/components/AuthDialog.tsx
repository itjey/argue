import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  KeyRound,
  Link2,
  LoaderCircle,
  Settings,
  LogIn,
  LogOut,
  MailCheck,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react'

type AuthMode = 'sign-in' | 'sign-up'
export const OPENROUTER_KEY_STORAGE = 'argue-openrouter-api-key'
export const OPENROUTER_URL_STORAGE = 'argue-openrouter-url'

type AuthDialogProps = {
  busyAction: string | null
  canAddPassword: boolean
  confirmPassword: string
  currentUser: User | null
  email: string
  errorMessage: string
  isVerified: boolean
  linkPassword: string
  linkPasswordConfirm: string
  mode: AuthMode
  open: boolean
  pendingGoogleEmail: string | null
  providerLabels: string[]
  statusMessage: string
  onAddPassword: () => void
  onClose: () => void
  onConfirmPasswordChange: (value: string) => void
  onEmailChange: (value: string) => void
  onEmailSubmit: () => void
  onGoogleSignIn: () => void
  onLinkPasswordChange: (value: string) => void
  onLinkPasswordConfirmChange: (value: string) => void
  onModeChange: (mode: AuthMode) => void
  onPasswordChange: (value: string) => void
  onRefreshVerification: () => void
  onResendVerification: () => void
  onSignOut: () => void
  password: string
}

function AuthDialog({
  busyAction,
  canAddPassword,
  confirmPassword,
  currentUser,
  email,
  errorMessage,
  isVerified,
  linkPassword,
  linkPasswordConfirm,
  mode,
  open,
  pendingGoogleEmail,
  password,
  providerLabels,
  statusMessage,
  onAddPassword,
  onClose,
  onConfirmPasswordChange,
  onEmailChange,
  onEmailSubmit,
  onGoogleSignIn,
  onLinkPasswordChange,
  onLinkPasswordConfirmChange,
  onModeChange,
  onPasswordChange,
  onRefreshVerification,
  onResendVerification,
  onSignOut,
}: AuthDialogProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [hasSavedUrl, setHasSavedUrl] = useState(false)

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false)
      return
    }

    const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    const storedUrl = window.localStorage.getItem(OPENROUTER_URL_STORAGE) ?? ''
    setApiKeyDraft(storedKey)
    setHasSavedApiKey(storedKey.trim().length > 0)
    setUrlDraft(storedUrl)
    setHasSavedUrl(storedUrl.trim().length > 0)
  }, [open])

  function applyApiKey(nextValue: string) {
    if (nextValue) {
      window.localStorage.setItem(OPENROUTER_KEY_STORAGE, nextValue)
    } else {
      window.localStorage.removeItem(OPENROUTER_KEY_STORAGE)
    }

    setApiKeyDraft(nextValue)
    setHasSavedApiKey(nextValue.trim().length > 0)
    window.dispatchEvent(new Event('argue-openrouter-key-changed'))
  }

  function applyUrl(nextValue: string) {
    if (nextValue) {
      window.localStorage.setItem(OPENROUTER_URL_STORAGE, nextValue)
    } else {
      window.localStorage.removeItem(OPENROUTER_URL_STORAGE)
    }

    setUrlDraft(nextValue)
    setHasSavedUrl(nextValue.trim().length > 0)
    window.dispatchEvent(new Event('argue-openrouter-key-changed')) // same event triggers openrouter to check
  }

  function handleSaveApiKey() {
    applyApiKey(apiKeyDraft.trim())
  }

  function handleClearApiKey() {
    applyApiKey('')
  }

  function handleSaveUrl() {
    applyUrl(urlDraft.trim())
  }

  function handleClearUrl() {
    applyUrl('')
  }

  if (!open) {
    return null
  }

  const showVerificationActions = currentUser && !isVerified

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <section
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="auth-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-header">
          <div>
            <p className="auth-dialog-kicker">
              {currentUser ? 'Account' : 'Authentication'}
            </p>
            <h2 id="auth-dialog-title">
              {currentUser ? 'Your Argue account' : 'Sign in to Argue'}
            </h2>
          </div>
          <button
            aria-label="Close authentication panel"
            className="auth-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {statusMessage ? (
          <div className="auth-feedback auth-feedback-success">
            <ShieldCheck size={16} />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="auth-feedback auth-feedback-error">
            <KeyRound size={16} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {pendingGoogleEmail && !currentUser ? (
          <div className="auth-note">
            Google is ready to link for <strong>{pendingGoogleEmail}</strong>.
            Sign in with your existing method first and the account will be merged.
          </div>
        ) : null}

        {currentUser ? (
          <div className="auth-account-stack">
            <div className="auth-card">
              <div className="auth-card-header">
                <div>
                  <p className="auth-label">Signed in as</p>
                  <h3>{currentUser.email ?? 'Unknown account'}</h3>
                </div>
                <div className="auth-state">
                  {isVerified ? <MailCheck size={16} /> : <UserIcon size={16} />}
                  <span>{isVerified ? 'Verified' : 'Verification needed'}</span>
                </div>
              </div>

              <div className="auth-provider-tags">
                {providerLabels.map((providerLabel) => (
                  <span className="auth-provider-tag" key={providerLabel}>
                    {providerLabel}
                  </span>
                ))}
              </div>
            </div>

            <button
              className="auth-secondary-button auth-settings-toggle"
              onClick={() => setSettingsOpen((isOpen) => !isOpen)}
              type="button"
            >
              <Settings size={16} />
              {settingsOpen ? 'Close settings' : 'Settings'}
            </button>

            {settingsOpen ? (
              <>
                <div className="auth-card auth-settings-card">
                  <p className="auth-label">OpenRouter API key</p>
                  <label className="auth-field">
                    <span>API key</span>
                    <input
                      autoComplete="off"
                      className="auth-input"
                      onChange={(event) => setApiKeyDraft(event.target.value)}
                      placeholder="sk-or-v1-..."
                      spellCheck={false}
                      type="password"
                      value={apiKeyDraft}
                    />
                  </label>
                  <div className="auth-inline-actions">
                    <button
                      className="auth-primary-button"
                      onClick={handleSaveApiKey}
                      type="button"
                    >
                      Save key
                    </button>
                    <button
                      className="auth-secondary-button"
                      onClick={handleClearApiKey}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <p
                    className={`auth-settings-status${
                      hasSavedApiKey
                        ? ' auth-settings-status-ok'
                        : ' auth-settings-status-missing'
                    }`}
                  >
                    {hasSavedApiKey ? 'API key saved' : 'API key missing'}
                  </p>
                </div>
                <div
                  className="auth-card auth-settings-card"
                  style={{ marginTop: '1rem' }}
                >
                  <p className="auth-label">API Base URL (optional)</p>
                  <label className="auth-field">
                    <span>Base URL</span>
                    <input
                      autoComplete="off"
                      className="auth-input"
                      onChange={(event) => setUrlDraft(event.target.value)}
                      placeholder="https://gphmt.org/api/v1"
                      spellCheck={false}
                      type="text"
                      value={urlDraft}
                    />
                  </label>
                  <div className="auth-inline-actions">
                    <button
                      className="auth-primary-button"
                      onClick={handleSaveUrl}
                      type="button"
                    >
                      Save URL
                    </button>
                    <button
                      className="auth-secondary-button"
                      onClick={handleClearUrl}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <p
                    className={`auth-settings-status${
                      hasSavedUrl ? ' auth-settings-status-ok' : ''
                    }`}
                  >
                    {hasSavedUrl ? 'Custom URL saved' : 'Using default URL'}
                  </p>
                </div>
              </>
            ) : null}

            {showVerificationActions ? (
              <div className="auth-card">
                <p className="auth-label">Email verification</p>
                <p className="auth-copy">
                  Your account is active, but the email/password path stays in a
                  pending state until you verify the email we sent.
                </p>
                <div className="auth-inline-actions">
                  <button
                    className="auth-secondary-button"
                    disabled={busyAction === 'refresh-verification'}
                    onClick={onRefreshVerification}
                    type="button"
                  >
                    {busyAction === 'refresh-verification' ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <MailCheck size={16} />
                    )}
                    Refresh status
                  </button>
                  <button
                    className="auth-secondary-button"
                    disabled={busyAction === 'resend-verification'}
                    onClick={onResendVerification}
                    type="button"
                  >
                    {busyAction === 'resend-verification' ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <MailCheck size={16} />
                    )}
                    Resend email
                  </button>
                </div>
              </div>
            ) : null}

            {canAddPassword ? (
              <div className="auth-card">
                <p className="auth-label">Add password login</p>
                <p className="auth-copy">
                  This links a password to the same Google-backed account, so the
                  email stays unified instead of creating a duplicate user.
                </p>
                <div className="auth-form-grid">
                  <label className="auth-field">
                    <span>Password</span>
                    <input
                      autoComplete="new-password"
                      className="auth-input"
                      onChange={(event) => onLinkPasswordChange(event.target.value)}
                      type="password"
                      value={linkPassword}
                    />
                  </label>
                  <label className="auth-field">
                    <span>Confirm password</span>
                    <input
                      autoComplete="new-password"
                      className="auth-input"
                      onChange={(event) => onLinkPasswordConfirmChange(event.target.value)}
                      type="password"
                      value={linkPasswordConfirm}
                    />
                  </label>
                </div>
                <button
                  className="auth-primary-button"
                  disabled={busyAction === 'link-password'}
                  onClick={onAddPassword}
                  type="button"
                >
                  {busyAction === 'link-password' ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Link2 size={16} />
                  )}
                  Add password sign-in
                </button>
              </div>
            ) : null}

            <button className="auth-secondary-button" onClick={onSignOut} type="button">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                className={`auth-tab ${mode === 'sign-in' ? 'auth-tab-active' : ''}`}
                onClick={() => onModeChange('sign-in')}
                type="button"
              >
                Sign in
              </button>
              <button
                className={`auth-tab ${mode === 'sign-up' ? 'auth-tab-active' : ''}`}
                onClick={() => onModeChange('sign-up')}
                type="button"
              >
                Create account
              </button>
            </div>

            <button
              className="auth-provider-button"
              disabled={busyAction === 'google'}
              onClick={onGoogleSignIn}
              type="button"
            >
              {busyAction === 'google' ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <LogIn size={16} />
              )}
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or use email</span>
            </div>

            <div className="auth-form-grid">
              <label className="auth-field">
                <span>Email</span>
                <input
                  autoComplete="email"
                  className="auth-input"
                  onChange={(event) => onEmailChange(event.target.value)}
                  type="email"
                  value={email}
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  className="auth-input"
                  onChange={(event) => onPasswordChange(event.target.value)}
                  type="password"
                  value={password}
                />
              </label>

              {mode === 'sign-up' ? (
                <label className="auth-field">
                  <span>Confirm password</span>
                  <input
                    autoComplete="new-password"
                    className="auth-input"
                    onChange={(event) => onConfirmPasswordChange(event.target.value)}
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              ) : null}
            </div>

            <button
              className="auth-primary-button"
              disabled={busyAction === 'email-submit'}
              onClick={onEmailSubmit}
              type="button"
            >
              {busyAction === 'email-submit' ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <KeyRound size={16} />
              )}
              {mode === 'sign-in' ? 'Sign in with email' : 'Create account'}
            </button>

            <p className="auth-copy">
              Email accounts get a verification email, Google accounts come in as
              verified, and both paths write the account profile into Firestore.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

export { AuthDialog }
export type { AuthMode }
