import { useEffect, useRef, useState } from 'react'
import type { FirebaseError } from 'firebase/app'
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type OAuthCredential,
  type User,
  verifyPasswordResetCode,
} from 'firebase/auth'
import { PricingPage } from './components/PricingPanel'
import {
  KeyRound,
  LoaderCircle,
  LogIn,
  MailCheck,
  X,
} from 'lucide-react'
import { AuthDialog, type AuthMode } from './components/AuthDialog'
import { WorkspaceShell } from './components/WorkspaceShell'
import {
  auth,
  getProviderLabels,
  hasPasswordProvider,
  syncUserProfile,
} from './lib/firebase'
import {
  OPENROUTER_KEY_STORAGE,
} from './lib/openrouterStorage'
import {
  isGuestModeEnabled,
} from './lib/runtimeConfig'
import './App.css'

type PendingGoogleLink = {
  credential: OAuthCredential
  email: string
}

function buildVerificationUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function formatAuthError(error: FirebaseError) {
  switch (error.code) {
    case 'auth/account-exists-with-different-credential':
      return 'This email already exists with another sign-in method. Sign in first and the Google account can be linked automatically.'
    case 'auth/email-already-in-use':
      return 'This email already belongs to an account. Sign in instead. If it started as Google, use Google first and then link a password from your account panel.'
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'The email or password did not match an existing account.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.'
    case 'auth/popup-blocked':
      return 'The browser blocked the Google popup. Allow popups for this site and try again.'
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled in Firebase yet.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/weak-password':
      return 'Use a stronger password with at least 8 characters.'
    case 'auth/provider-already-linked':
      return 'That sign-in method is already linked to this account.'
    case 'auth/expired-action-code':
      return 'This email link has expired. Request a new one and try again.'
    case 'auth/invalid-action-code':
      return 'This email link is invalid or has already been used.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

function App() {
  const guestModeEnabled = isGuestModeEnabled()
  const lastScrollYRef = useRef(0)
  const topbarHiddenRef = useRef(false)
  const scrollFrameRef = useRef<number | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [linkPasswordConfirm, setLinkPasswordConfirm] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser)
  const [pendingGoogleLink, setPendingGoogleLink] =
    useState<PendingGoogleLink | null>(null)
  const [passwordResetOpen, setPasswordResetOpen] = useState(false)
  const [passwordResetCode, setPasswordResetCode] = useState('')
  const [passwordResetEmail, setPasswordResetEmail] = useState('')
  const [passwordResetPassword, setPasswordResetPassword] = useState('')
  const [passwordResetConfirm, setPasswordResetConfirm] = useState('')
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const [passwordResetMessage, setPasswordResetMessage] = useState('')
  const [passwordResetError, setPasswordResetError] = useState('')
  const [openRouterSettingsRequested, setOpenRouterSettingsRequested] = useState(false)
  const [topbarHidden, setTopbarHidden] = useState(false)
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false)
  const [isLight, setIsLight] = useState(() => {
    const stored = window.localStorage.getItem('argue-theme') === 'light'
    document.documentElement.setAttribute('data-theme', stored ? 'light' : 'dark')
    return stored
  })

  function toggleTheme() {
    setIsLight((prev) => {
      const next = !prev
      document.documentElement.setAttribute('data-theme', next ? 'light' : 'dark')
      window.localStorage.setItem('argue-theme', next ? 'light' : 'dark')
      return next
    })
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setCurrentUser(nextUser)

      if (nextUser) {
        setAuthEmail(nextUser.email ?? '')
        void syncUserProfile(nextUser).catch(() => undefined)
      }
    })

    return unsubscribe
  }, [])



  useEffect(() => {
    lastScrollYRef.current = window.scrollY
    topbarHiddenRef.current = false

    const updateTopbarVisibility = () => {
      scrollFrameRef.current = null
      const nextScrollY = window.scrollY
      const delta = nextScrollY - lastScrollYRef.current
      let nextHidden = topbarHiddenRef.current

      if (nextScrollY <= 48) {
        nextHidden = false
      } else if (delta >= 4) {
        nextHidden = true
      } else if (delta <= -4) {
        nextHidden = false
      }

      if (nextHidden !== topbarHiddenRef.current) {
        topbarHiddenRef.current = nextHidden
        setTopbarHidden(nextHidden)
      }

      lastScrollYRef.current = nextScrollY
    }

    const handleScroll = () => {
      if (scrollFrameRef.current != null) {
        return
      }

      scrollFrameRef.current = window.requestAnimationFrame(updateTopbarVisibility)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)

      if (scrollFrameRef.current != null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!authDialogOpen) {
      return undefined
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAuthDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [authDialogOpen])

  useEffect(() => {
    const handleOpenRouterAuthError = (
      event: Event,
    ) => {
      const customEvent = event as CustomEvent<{
        message?: string
        openSettings?: boolean
      }>

      clearFeedback()
      setErrorMessage(
        customEvent.detail?.message ??
          'OpenRouter authentication failed. Update the key and try again.',
      )
      setOpenRouterSettingsRequested(Boolean(customEvent.detail?.openSettings))
      setAuthMode('sign-in')
      setAuthDialogOpen(true)
    }

    window.addEventListener('argue-openrouter-auth-error', handleOpenRouterAuthError)

    return () => {
      window.removeEventListener('argue-openrouter-auth-error', handleOpenRouterAuthError)
    }
  }, [])

  useEffect(() => {
    const syncSavedApiKey = () => {
      const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
      setHasSavedApiKey(storedKey.trim().length > 0)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSavedApiKey()
      }
    }

    syncSavedApiKey()

    window.addEventListener('argue-openrouter-key-changed', syncSavedApiKey)
    window.addEventListener('focus', syncSavedApiKey)
    window.addEventListener('storage', syncSavedApiKey)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('argue-openrouter-key-changed', syncSavedApiKey)
      window.removeEventListener('focus', syncSavedApiKey)
      window.removeEventListener('storage', syncSavedApiKey)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function clearFeedback() {
    setStatusMessage('')
    setErrorMessage('')
  }

  function resetPasswordResetState() {
    setPasswordResetOpen(false)
    setPasswordResetCode('')
    setPasswordResetEmail('')
    setPasswordResetPassword('')
    setPasswordResetConfirm('')
    setPasswordResetBusy(false)
    setPasswordResetComplete(false)
    setPasswordResetMessage('')
    setPasswordResetError('')
  }

  function resetCredentialForms() {
    setAuthPassword('')
    setAuthConfirmPassword('')
    setLinkPassword('')
    setLinkPasswordConfirm('')
  }

  async function syncUserState(
    user: User,
    options?: Parameters<typeof syncUserProfile>[1],
  ) {
    await syncUserProfile(user, options)
    setCurrentUser(auth.currentUser ?? user)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode')
    const oobCode = params.get('oobCode')

    if (!mode || !oobCode) {
      return
    }

    window.history.replaceState({}, document.title, buildVerificationUrl())

    if (mode === 'verifyEmail') {
      clearFeedback()
      resetCredentialForms()
      setAuthMode('sign-in')
      setAuthDialogOpen(true)
      setBusyAction('email-action')

      void (async () => {
        try {
          await applyActionCode(auth, oobCode)

          if (auth.currentUser) {
            await reload(auth.currentUser)
            await syncUserState(auth.currentUser)
          }

          setStatusMessage('Email verified. Sign in to continue.')
        } catch (error) {
          setErrorMessage(formatAuthError(error as FirebaseError))
        } finally {
          setBusyAction(null)
        }
      })()

      return
    }

    if (mode === 'resetPassword') {
      setPasswordResetOpen(true)
      setPasswordResetCode(oobCode)
      setPasswordResetBusy(true)
      setPasswordResetComplete(false)
      setPasswordResetMessage('')
      setPasswordResetError('')

      void verifyPasswordResetCode(auth, oobCode)
        .then((email) => {
          setPasswordResetEmail(email)
          setAuthEmail(email)
        })
        .catch((error) => {
          setPasswordResetError(formatAuthError(error as FirebaseError))
        })
        .finally(() => {
          setPasswordResetBusy(false)
        })

      return
    }

    setAuthMode('sign-in')
    setAuthDialogOpen(true)
    setErrorMessage('This email action is not supported in the current flow.')
  }, [])

  function openAuthDialog(mode: AuthMode = 'sign-in') {
    clearFeedback()
    setOpenRouterSettingsRequested(false)
    resetCredentialForms()
    setAuthMode(mode)

    if (!currentUser) {
      if (mode === 'sign-up' && pendingGoogleLink) {
        setAuthEmail(pendingGoogleLink.email)
      } else if (mode === 'sign-in' && pendingGoogleLink) {
        setAuthEmail(pendingGoogleLink.email)
      }
    }

    setAuthDialogOpen(true)
  }

  function handleDialogClose() {
    clearFeedback()
    setOpenRouterSettingsRequested(false)
    resetCredentialForms()
    setAuthDialogOpen(false)
  }

  function handleModeChange(mode: AuthMode) {
    clearFeedback()
    setOpenRouterSettingsRequested(false)
    resetCredentialForms()
    setAuthMode(mode)
  }

  async function handleGoogleSignIn() {
    clearFeedback()
    setBusyAction('google')
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(auth, provider)
      if (result.user) {
        await syncUserState(result.user, { lastAuthMethod: 'google' })
      }
      resetCredentialForms()
      setPendingGoogleLink(null)
      setAuthDialogOpen(false)
      setBusyAction(null)
    } catch (error) {
      const fbErr = error as FirebaseError
      console.error('[Auth] Google sign-in error:', fbErr.code, fbErr.message)
      if (fbErr.code === 'auth/account-exists-with-different-credential') {
        const credential = GoogleAuthProvider.credentialFromError(fbErr) as OAuthCredential | null
        const conflictEmail = String(fbErr.customData?.email ?? '').trim()
        if (credential && conflictEmail) {
          setPendingGoogleLink({ credential, email: conflictEmail })
          setAuthEmail(conflictEmail)
        }
        setAuthMode('sign-in')
        setAuthDialogOpen(true)
        setStatusMessage('Google found an existing account for this email. Sign in with the matching method first.')
      } else if (fbErr.code === 'auth/popup-closed-by-user' || fbErr.code === 'auth/cancelled-popup-request') {
        setErrorMessage('The Google sign-in popup was closed before completing. Please try again, and allow the popup to finish.')
      } else if (fbErr.code === 'auth/popup-blocked') {
        setErrorMessage('The browser blocked the Google sign-in popup. Please allow popups for this site and try again.')
      } else {
        setErrorMessage(formatAuthError(fbErr))
      }
      setBusyAction(null)
    }
  }

  async function handleEmailSubmit() {
    const email = authEmail.trim()
    const normalizedEmail = normalizeEmail(email)

    clearFeedback()

    if (!email) {
      setErrorMessage('Enter an email address to continue.')
      return
    }

    if (!authPassword) {
      setErrorMessage('Enter a password to continue.')
      return
    }

    if (authPassword.length < 8) {
      setErrorMessage('Use a password with at least 8 characters.')
      return
    }

    if (authMode === 'sign-up' && authPassword !== authConfirmPassword) {
      setErrorMessage('The password confirmation does not match.')
      return
    }

    if (
      authMode === 'sign-in' &&
      pendingGoogleLink &&
      normalizeEmail(pendingGoogleLink.email) !== normalizedEmail
    ) {
      setErrorMessage(
        `Use ${pendingGoogleLink.email} to finish linking the Google account.`,
      )
      return
    }

    setBusyAction('email-submit')

    try {
      if (authMode === 'sign-up') {
        const result = await createUserWithEmailAndPassword(auth, email, authPassword)

        await sendEmailVerification(result.user, { url: buildVerificationUrl() })
        await syncUserState(result.user, {
          lastAuthMethod: 'password',
          verificationEmailRequested: true,
        })

        setStatusMessage(
          'Account created. Check your email for the verification link, then return here and refresh the account state.',
        )
        setAuthPassword('')
        setAuthConfirmPassword('')
        setAuthDialogOpen(true)
        return
      }

      const result = await signInWithEmailAndPassword(auth, email, authPassword)

      if (
        pendingGoogleLink &&
        normalizeEmail(result.user.email ?? '') === normalizeEmail(pendingGoogleLink.email)
      ) {
        await linkWithCredential(result.user, pendingGoogleLink.credential)
        setPendingGoogleLink(null)
        await syncUserState(result.user, {
          lastAuthMethod: 'password',
          linkedProvider: 'google',
        })
        setStatusMessage(
          'Signed in and linked with Google. This email now stays on one unified account.',
        )
      } else {
        await syncUserState(result.user, { lastAuthMethod: 'password' })
      }

      resetCredentialForms()
      setAuthDialogOpen(false)
    } catch (error) {
      setErrorMessage(formatAuthError(error as FirebaseError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleResendVerification() {
    if (!currentUser) {
      return
    }

    clearFeedback()
    setBusyAction('resend-verification')

    try {
      await sendEmailVerification(currentUser, { url: buildVerificationUrl() })
      await syncUserState(currentUser, { verificationEmailRequested: true })
      setStatusMessage('Verification email sent. Check your inbox and spam folder.')
    } catch (error) {
      setErrorMessage(formatAuthError(error as FirebaseError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleRefreshVerification() {
    if (!currentUser) {
      return
    }

    clearFeedback()
    setBusyAction('refresh-verification')

    try {
      await reload(currentUser)
      const refreshedUser = auth.currentUser

      if (!refreshedUser) {
        setCurrentUser(null)
        return
      }

      await syncUserState(refreshedUser)
      setStatusMessage(
        refreshedUser.emailVerified
          ? 'Email verified. The account is fully active now.'
          : 'Verification is still pending. Open the email link first, then refresh again.',
      )
    } catch (error) {
      setErrorMessage(formatAuthError(error as FirebaseError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleAddPassword() {
    if (!currentUser || !currentUser.email) {
      return
    }

    clearFeedback()

    if (!linkPassword) {
      setErrorMessage('Enter a password to add email sign-in.')
      return
    }

    if (linkPassword.length < 8) {
      setErrorMessage('Use a password with at least 8 characters.')
      return
    }

    if (linkPassword !== linkPasswordConfirm) {
      setErrorMessage('The password confirmation does not match.')
      return
    }

    setBusyAction('link-password')

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, linkPassword)
      const linkedUser = await linkWithCredential(currentUser, credential)
      await syncUserState(linkedUser.user, {
        lastAuthMethod: 'google',
        linkedProvider: 'password',
      })
      resetCredentialForms()
      setStatusMessage(
        'Password sign-in added. Google and email now use the same Argue account.',
      )
    } catch (error) {
      setErrorMessage(formatAuthError(error as FirebaseError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSignOut() {
    clearFeedback()

    try {
      await signOut(auth)
      setCurrentUser(null)
      setPendingGoogleLink(null)
      setAuthEmail('')
      setAuthMode('sign-in')
      resetCredentialForms()
      setAuthDialogOpen(false)
    } catch (error) {
      setErrorMessage(formatAuthError(error as FirebaseError))
    }
  }

  function handlePasswordResetClose() {
    resetPasswordResetState()
  }

  async function handlePasswordResetSubmit() {
    if (!passwordResetCode) {
      setPasswordResetError('This password reset link is invalid or expired.')
      return
    }

    setPasswordResetError('')

    if (!passwordResetPassword) {
      setPasswordResetError('Enter a new password to continue.')
      return
    }

    if (passwordResetPassword.length < 8) {
      setPasswordResetError('Use a password with at least 8 characters.')
      return
    }

    if (passwordResetPassword !== passwordResetConfirm) {
      setPasswordResetError('The password confirmation does not match.')
      return
    }

    setPasswordResetBusy(true)

    try {
      await confirmPasswordReset(auth, passwordResetCode, passwordResetPassword)
      setPasswordResetComplete(true)
      setPasswordResetMessage(
        'Password updated. Sign in with your new password to continue.',
      )
      setPasswordResetCode('')
      setAuthMode('sign-in')
    } catch (error) {
      setPasswordResetError(formatAuthError(error as FirebaseError))
    } finally {
      setPasswordResetBusy(false)
    }
  }

  function handleOpenLoginFromReset() {
    resetPasswordResetState()
    openAuthDialog('sign-in')
  }

  const providerLabels = getProviderLabels(currentUser)
  const canAddPassword = Boolean(currentUser?.email && !hasPasswordProvider(currentUser))
  const isVerified = currentUser?.emailVerified ?? false
  const workspaceVisible = Boolean(currentUser) || guestModeEnabled

  return (
    <div className="app-shell">
      {!(!workspaceVisible && !pricingOpen) ? (
        <>
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <div className="ambient ambient-three" />
        </>
      ) : null}

      <header
        className={`topbar${topbarHidden ? ' topbar-hidden' : ''}${!workspaceVisible && !pricingOpen ? ' topbar-home' : ''}`}
      >
        <button
          className="brand brand-button"
          type="button"
          aria-label="Argue home"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-fan">
              <svg className="brand-blade brand-blade-left brand-blade-svg" viewBox="-1 -6 25 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              </svg>
              <svg className="brand-blade brand-blade-center brand-blade-svg" viewBox="-1 -6 25 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              </svg>
              <svg className="brand-blade brand-blade-right brand-blade-svg" viewBox="-1 -6 25 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <span className="brand-wordmark">argue</span>
        </button>

        <nav className="nav" aria-label="Primary navigation">
          {workspaceVisible ? (
            <>
              <button className="nav-link-button" onClick={() => setPricingOpen(false)} type="button">
                Chat
              </button>
              <button className="nav-link-button" onClick={() => setPricingOpen(false)} type="button">
                Models
              </button>
              <button className="nav-link-button" onClick={() => setPricingOpen(true)} type="button">
                Pricing
              </button>
              <button className="nav-link-button" onClick={() => openAuthDialog('sign-in')} type="button">
                Account
              </button>
            </>
          ) : null}
        </nav>

        <button
          className={`topbar-account-button${
            currentUser && isVerified ? ' topbar-account-button-minimal' : ''
          }`}
          onClick={() => openAuthDialog('sign-in')}
          type="button"
        >
          {currentUser ? (
            <span className="topbar-account-copy">
              <strong>{currentUser.email ?? 'Account'}</strong>
              {!hasSavedApiKey ? (
                <small className="topbar-api-key-warning">
                  no credits
                </small>
              ) : !isVerified ? (
                <small className="topbar-account-warning">⚠ unverified</small>
              ) : null}
            </span>
          ) : (
            <>
              <span className="topbar-account-copy">
                <strong>Login</strong>
              </span>
            </>
          )}
        </button>
      </header>

        <main className={`page${workspaceVisible && !pricingOpen ? ' page-workspace' : ''}${pricingOpen ? ' page-pricing' : ''}${!workspaceVisible && !pricingOpen ? ' page-home' : ''}`} id="top">
        {pricingOpen ? (
          <PricingPage onClose={() => setPricingOpen(false)} />
        ) : workspaceVisible ? (
          <WorkspaceShell currentUser={currentUser} />
        ) : (
          <section className="home-minimal" aria-label="Homepage">
            <div className="home-minimal-copy">
              <h1 className="home-minimal-wordmark">argue</h1>
              <p className="home-minimal-description">
                A private workspace for sharper conversations with models.
              </p>
              <button
                className="home-minimal-cta"
                onClick={() => openAuthDialog('sign-in')}
                type="button"
              >
                Start chatting
              </button>
            </div>
          </section>
        )}
      </main>

      <AuthDialog
        autoOpenSettings={openRouterSettingsRequested}
        busyAction={busyAction}
        canAddPassword={canAddPassword}
        confirmPassword={authConfirmPassword}
        currentUser={currentUser}
        email={authEmail}
        errorMessage={errorMessage}
        isVerified={isVerified}
        linkPassword={linkPassword}
        linkPasswordConfirm={linkPasswordConfirm}
        mode={authMode}
        open={authDialogOpen}
        password={authPassword}
        pendingGoogleEmail={pendingGoogleLink?.email ?? null}
        providerLabels={providerLabels}
        statusMessage={statusMessage}
        onAddPassword={handleAddPassword}
        onClose={handleDialogClose}
        onConfirmPasswordChange={setAuthConfirmPassword}
        onEmailChange={setAuthEmail}
        onEmailSubmit={handleEmailSubmit}
        onGoogleSignIn={handleGoogleSignIn}
        onLinkPasswordChange={setLinkPassword}
        onLinkPasswordConfirmChange={setLinkPasswordConfirm}
        onModeChange={handleModeChange}
        onPasswordChange={setAuthPassword}
        onRefreshVerification={handleRefreshVerification}
        onResendVerification={handleResendVerification}
        onSignOut={handleSignOut}
        isLight={isLight}
        onThemeToggle={toggleTheme}
      />

      {pricingOpen ? null : (
        <>
      {passwordResetOpen ? (
        <div className="auth-backdrop" onClick={handlePasswordResetClose}>
          <section
            aria-modal="true"
            aria-labelledby="password-reset-title"
            className="auth-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="auth-dialog-header">
              <div>
                <p className="auth-dialog-kicker">Recovery</p>
                <h2 id="password-reset-title">Reset your password</h2>
              </div>
              <button
                aria-label="Close password reset panel"
                className="auth-close"
                onClick={handlePasswordResetClose}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {passwordResetMessage ? (
              <div className="auth-feedback auth-feedback-success">
                <MailCheck size={16} />
                <span>{passwordResetMessage}</span>
              </div>
            ) : null}

            {passwordResetError ? (
              <div className="auth-feedback auth-feedback-error">
                <KeyRound size={16} />
                <span>{passwordResetError}</span>
              </div>
            ) : null}

            {passwordResetBusy ? (
              <div className="auth-note">
                <LoaderCircle className="spin" size={16} />
                <span>Validating your password reset link.</span>
              </div>
            ) : null}

            {!passwordResetBusy && passwordResetEmail && !passwordResetComplete ? (
              <>
                <p className="auth-copy">
                  Create a new password for <strong>{passwordResetEmail}</strong>.
                </p>
                <div className="auth-form-grid">
                  <label className="auth-field">
                    <span>New password</span>
                    <input
                      autoComplete="new-password"
                      className="auth-input"
                      onChange={(event) => setPasswordResetPassword(event.target.value)}
                      type="password"
                      value={passwordResetPassword}
                    />
                  </label>
                  <label className="auth-field">
                    <span>Confirm password</span>
                    <input
                      autoComplete="new-password"
                      className="auth-input"
                      onChange={(event) => setPasswordResetConfirm(event.target.value)}
                      type="password"
                      value={passwordResetConfirm}
                    />
                  </label>
                </div>
                <button
                  className="auth-primary-button"
                  disabled={passwordResetBusy}
                  onClick={handlePasswordResetSubmit}
                  type="button"
                >
                  <KeyRound size={16} />
                  Update password
                </button>
              </>
            ) : null}

            {!passwordResetBusy && passwordResetComplete ? (
              <button
                className="auth-primary-button"
                onClick={handleOpenLoginFromReset}
                type="button"
              >
                <LogIn size={16} />
                Open login
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
      </>
      )}
    </div>
  )
}

export default App
