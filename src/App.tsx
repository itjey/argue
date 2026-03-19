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
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
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
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MailCheck,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Workflow,
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
  isServerManagedOpenRouter,
} from './lib/runtimeConfig'
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
  const guestModeEnabled = isGuestModeEnabled()
  const serverManagedOpenRouter = isServerManagedOpenRouter()
  const lastScrollYRef = useRef(0)
  const topbarHiddenRef = useRef(false)
  const scrollFrameRef = useRef<number | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
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
  const [topbarHidden, setTopbarHidden] = useState(false)
  const [hasSavedApiKey, setHasSavedApiKey] = useState(serverManagedOpenRouter)

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
    if (serverManagedOpenRouter) {
      setHasSavedApiKey(true)
      return undefined
    }

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
  }, [serverManagedOpenRouter])

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
    resetCredentialForms()
    setAuthDialogOpen(false)
  }

  function handleModeChange(mode: AuthMode) {
    clearFeedback()
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
      await syncUserState(result.user, { lastAuthMethod: 'google' })
      setPendingGoogleLink(null)
      resetCredentialForms()
      setAuthDialogOpen(false)
    } catch (error) {
      const firebaseError = error as FirebaseError

      if (firebaseError.code === 'auth/account-exists-with-different-credential') {
        const credential = GoogleAuthProvider.credentialFromError(
          firebaseError,
        ) as OAuthCredential | null
        const conflictEmail = String(firebaseError.customData?.email ?? '').trim()

        if (credential && conflictEmail) {
          setPendingGoogleLink({ credential, email: conflictEmail })
          setAuthEmail(conflictEmail)
        }

        setAuthMode('sign-in')
        setAuthDialogOpen(true)
        setStatusMessage(
          'Google found an existing account for this email. Sign in with the matching email account first and Argue will merge Google into it.',
        )
      } else {
        setErrorMessage(formatAuthError(firebaseError))
      }
    } finally {
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
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className={`topbar${topbarHidden ? ' topbar-hidden' : ''}`}>
        <a className="brand" href="#top" aria-label="Argue home">
          <svg className="brand-favicon-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <g transform="translate(4, 16) scale(0.82)">
              <path transform="rotate(-30)" d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/>
              <path d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/>
              <path transform="rotate(30)" d="M0 0L23 -5V5L0 0Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/>
            </g>
          </svg>
        </a>

        <nav className="nav" aria-label="Primary navigation">
          {workspaceVisible ? (
            <>
              <a href="#chat">Chat</a>
              <a href="#models">Models</a>
              <button className="nav-link-button" onClick={() => openAuthDialog('sign-in')} type="button">
                Account
              </button>
            </>
          ) : (
            <>
              <a href="#concept">Concept</a>
              <a href="#workflow">Workflow</a>
              <a href="#interface">Interface</a>
              <a href="#trust">Trust</a>
            </>
          )}
        </nav>

        <button
          className={`topbar-cta topbar-account-button${
            currentUser && isVerified ? ' topbar-account-button-minimal' : ''
          }`}
          onClick={() => openAuthDialog('sign-in')}
          type="button"
        >
          {currentUser ? (
            <span className="topbar-account-copy">
              <strong>{currentUser.email ?? 'Account'}</strong>
              {!serverManagedOpenRouter && !hasSavedApiKey ? (
                <small className="topbar-api-key-warning">
                  Add API key in Settings
                </small>
              ) : !isVerified ? (
                <small className="topbar-account-warning">Unverified account</small>
              ) : null}
            </span>
          ) : (
            <>
              <LogIn size={16} />
              <span className="topbar-account-copy">
                <strong>Login</strong>
                <small>Google or email</small>
              </span>
            </>
          )}
        </button>
      </header>

        <main className={`page${workspaceVisible ? ' page-workspace' : ''}`} id="top">
        {workspaceVisible ? (
          <WorkspaceShell currentUser={currentUser} />
        ) : (
          <>
        <section className="hero section" id="concept">
          <div className="hero-copy">
            <div className="hero-overline-row">
              <span className="hero-overline-pill">Private multi-model workspace</span>
              <span className="hero-overline-pill hero-overline-pill-muted">
                Live reasoning, metrics, and role-based debate
              </span>
            </div>
            <div className="hero-type-line">
              <span className="hero-typewriter" aria-label="argue.">
                argue.
              </span>
            </div>
            <h1>Make frontier models challenge each other until the answer holds.</h1>
            <p className="hero-text">
              Argue is a stripped-back multi-model workspace for professionals who
              want sharper thinking, not louder software. Choose the models,
              assign the roles, paste your own API keys, and let specialists
              challenge each other across programming, math, research, and planning.
            </p>
            <p className="hero-subtext">
              Built for people who want a command room, not a toy box.
            </p>

            <div className="hero-actions">
              <button
                className="button button-primary"
                onClick={() => openAuthDialog(currentUser ? 'sign-in' : 'sign-up')}
                type="button"
              >
                {currentUser ? 'Open account' : 'Create account'}
                <ArrowRight size={18} />
              </button>
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
            <div className="workspace-shell workspace-shell-hero">
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
              a private control room for difficult decisions, not a dashboard chasing attention.
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
              <h2>A precise command surface for serious multi-model work.</h2>
              <p className="section-copy">
                Every panel is tuned for clarity. No wasted chrome. No soft decoration.
                Just structure, contrast, and enough visual hierarchy to keep long sessions readable.
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
                    <p className="panel-label">Account layer</p>
                    <h3>Unified sign-in across Google and email</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>

                <div className="provider-list">
                  <div className="provider-row">
                    <span>Google</span>
                    <strong>Enabled</strong>
                  </div>
                  <div className="provider-row">
                    <span>Email + password</span>
                    <strong>Enabled</strong>
                  </div>
                  <div className="provider-row">
                    <span>Verification</span>
                    <strong>Required</strong>
                  </div>
                  <div className="provider-row">
                    <span>Profile sync</span>
                    <strong>Firestore</strong>
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
                <p className="panel-label">Identity result</p>
                <h3>One account per email, even when Google gets linked later.</h3>
                <p className="control-copy">
                  The auth layer writes account state to Firestore, keeps the email
                  visible in the product, and prevents messy duplicate identities
                  when the same person uses different sign-in methods.
                </p>
                <div className="chip-row">
                  <span>Email verified</span>
                  <span>Google linked</span>
                  <span>Firestore profile</span>
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
                This concept leans into a monochrome system, Lucide-only iconography,
                a horizontal three-blade mark, typed hero branding, and a tighter,
                more architectural layout across desktop, tablet, and mobile.
              </p>
            </div>

            <div className="cta-points">
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Google and email login</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Verification flow</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Firestore profile sync</span>
              </div>
            </div>
          </div>
        </section>
          </>
        )}
      </main>

      <AuthDialog
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
      />

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
    </div>
  )
}

export default App
