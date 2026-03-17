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
import { CollaborationWorkspace } from './components/CollaborationWorkspace'
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
    value: '3+',
    label: 'AI models debating',
    detail: 'GPT-5.4, Gemini 3.1 Pro, Claude Opus 4.6 challenge each other in real time.',
  },
  {
    value: '1-4',
    label: 'configurable rounds',
    detail: 'Set the number of debate rounds to match problem difficulty.',
  },
  {
    value: 'Full',
    label: 'reasoning trace',
    detail: 'Every argument, rebuttal, and synthesis stays visible for review.',
  },
]

const featureCards: FeatureCard[] = [
  {
    icon: Code2,
    eyebrow: 'Programming',
    title: 'Models write, review, and attack each other\'s code.',
    description:
      'One model architects, another implements, a third hunts edge cases. Ship code that survived adversarial review before you even look at it.',
  },
  {
    icon: Sigma,
    eyebrow: 'Math & Stats',
    title: 'Proof-checking across multiple rounds of debate.',
    description:
      'Symbolic reasoning, numerical verification, and dissent happen together so the final answer survives scrutiny from every angle.',
  },
  {
    icon: ScrollText,
    eyebrow: 'Research',
    title: 'Competing reasoning strategies surface the strongest answer.',
    description:
      'Different models bring different approaches. The debate structure forces them to defend their reasoning and expose weaknesses.',
  },
]

const flowSteps: FlowStep[] = [
  {
    icon: KeyRound,
    title: 'Bring your API key',
    description:
      'Paste your OpenRouter key once. You control the models and the spend.',
  },
  {
    icon: Layers3,
    title: 'Configure the debate',
    description:
      'Choose models, assign roles like Builder or Adversary, set token budgets, and pick 1-4 rounds of debate.',
  },
  {
    icon: MessagesSquare,
    title: 'Models debate in rounds',
    description:
      'Each model responds in its role, reads the others\' arguments, and refines its position through structured rounds.',
  },
  {
    icon: FileOutput,
    title: 'Lead synthesizes the answer',
    description:
      'The lead model reads everything and writes a final synthesis — the strongest answer that survived the debate.',
  },
]

const trustPoints: FlowStep[] = [
  {
    icon: SlidersHorizontal,
    title: 'Configurable reasoning depth',
    description:
      'Run a quick 1-round check or a deep 4-round debate. Match the effort to the problem.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based specialization',
    description:
      'Builder, Analyst, Adversary — each model has a job, a brief, and a token budget so the debate stays focused.',
  },
  {
    icon: ScrollText,
    title: 'Full debate transcript',
    description:
      'Every round, every argument, every rebuttal is saved. Expand any phase to see exactly how the answer was built.',
  },
]

const models: Model[] = [
  {
    icon: BrainCircuit,
    name: 'GPT-5.4 Builder',
    specialty: 'Owns the implementation path and delivers the most complete solution.',
    tone: 'Practical, structured, thorough',
  },
  {
    icon: Braces,
    name: 'Gemini 3.1 Pro Analyst',
    specialty: 'Breaks the problem down, surfaces edge cases, and stress-tests assumptions.',
    tone: 'Precise, methodical',
  },
  {
    icon: Sigma,
    name: 'Claude Opus 4.6 Adversary',
    specialty: 'Challenges weak logic, finds missing pieces, and pushes for stronger answers.',
    tone: 'Skeptical, rigorous',
  },
]

const thread: Message[] = [
  {
    icon: BrainCircuit,
    speaker: 'GPT-5.4 Builder',
    role: 'Proposes the approach',
    text: 'For the recurrence T(n) = 2T(n/2) + n, I\'ll apply the Master Theorem. We have a=2, b=2, so log₂2 = 1. Since f(n) = n = Θ(n¹), we\'re in Case 2. The solution is T(n) = Θ(n log n).',
  },
  {
    icon: Braces,
    speaker: 'Gemini 3.1 Pro Analyst',
    role: 'Verifies the reasoning',
    text: 'The Master Theorem application is correct, but we should verify with substitution. Assume T(n) = cn log n. Then 2·c(n/2)·log(n/2) + n = cn(log n - 1) + n = cn log n + n(1-c). For c=1 this holds. The bound is confirmed.',
  },
  {
    icon: Sigma,
    speaker: 'Claude Opus 4.6 Adversary',
    role: 'Challenges an assumption',
    text: 'Both analyses assume the base case is T(1) = O(1). If the problem intends T(1) = 1 specifically, the constant factor changes. Also: the Master Theorem requires f(n) to be asymptotically positive — true here, but worth stating explicitly for a formal proof.',
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
          <CollaborationWorkspace currentUser={currentUser} />
        ) : (
          <>
        <section className="hero section" id="concept">
          <div className="hero-copy">
            <div className="hero-overline-row">
              <span className="hero-overline-pill">Multi-model debate platform</span>
              <span className="hero-overline-pill hero-overline-pill-muted">
                Configurable roles, rounds, and token budgets
              </span>
            </div>
            <div className="hero-type-line">
              <span className="hero-typewriter" aria-label="argue.">
                argue.
              </span>
            </div>
            <h1>Make frontier models debate hard problems until the best answer emerges.</h1>
            <p className="hero-text">
              Argue is a platform where different AI models debate and reason
              through difficult problems. Choose models, assign specialized roles,
              set token budgets and debate rounds, and watch them challenge each
              other across programming, math, and research.
            </p>
            <p className="hero-subtext">
              Built for people who need verifiable answers, not guesses.
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
                  <p className="workspace-label">Live debate</p>
                  <h2>Solve T(n) = 2T(n/2) + n</h2>
                </div>
                <div className="status-pill">
                  <BadgeCheck size={16} />
                  Synthesis in progress
                </div>
              </div>

              <div className="workspace-grid">
                <aside className="workspace-sidebar">
                  <div className="panel-card">
                    <p className="panel-label">Problem</p>
                    <h3>Solve the recurrence T(n) = 2T(n/2) + n and prove the bound.</h3>
                    <div className="chip-row">
                      <span>Math proof</span>
                      <span>2 rounds</span>
                      <span>High reasoning</span>
                    </div>
                  </div>

                  <div className="panel-card">
                    <p className="panel-label">Debate roster</p>
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
                        <p className="panel-label">Final synthesis</p>
                        <h3>T(n) = Θ(n log n), confirmed by Master Theorem and substitution.</h3>
                      </div>
                      <div className="verdict-score">
                        <Clock3 size={16} />
                        2 rounds
                      </div>
                    </div>

                    <div className="verdict-grid">
                      <div>
                        <p className="mini-label">Accepted proof</p>
                        <p className="mini-text">
                          Master Theorem Case 2 applies with a=2, b=2. Verified via
                          substitution method with T(1) = O(1) base case.
                        </p>
                      </div>
                      <div>
                        <p className="mini-label">Adversary note</p>
                        <p className="mini-text">
                          Base case assumption should be stated explicitly. Asymptotic
                          positivity of f(n) = n holds trivially but needs mention in formal proof.
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
              Hard problems in math, stats, and programming — solved through debate.
            </h2>
            <p className="section-copy">
              Single-model answers are often confidently wrong. Argue makes models
              defend their reasoning against each other, so errors get caught before you act on them.
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
            <h2>From API key to verified answer in four steps.</h2>
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
              <h2>Configure every dimension of the debate.</h2>
              <p className="section-copy">
                Rounds, reasoning depth, model count, token budgets, and specialized roles —
                all adjustable before each debate. Save configurations that work and share them publicly.
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
                    <p className="panel-label">Debate settings</p>
                    <h3>Multi-model configuration</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>

                <div className="provider-list">
                  <div className="provider-row">
                    <span>Debate rounds</span>
                    <strong>1-4 rounds</strong>
                  </div>
                  <div className="provider-row">
                    <span>Reasoning depth</span>
                    <strong>Min → Max</strong>
                  </div>
                  <div className="provider-row">
                    <span>Models</span>
                    <strong>2-5 per debate</strong>
                  </div>
                  <div className="provider-row">
                    <span>Token budgets</span>
                    <strong>256-8192 each</strong>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <div className="control-card-header">
                  <div>
                    <p className="panel-label">Role assignment</p>
                    <h3>Specialized model roles</h3>
                  </div>
                  <Workflow size={18} />
                </div>

                <div className="setting-row">
                  <span>Builder</span>
                  <span>Implementation lead</span>
                </div>
                <div className="setting-row">
                  <span>Analyst</span>
                  <span>Edge case hunter</span>
                </div>
                <div className="setting-row">
                  <span>Adversary</span>
                  <span>Logic challenger</span>
                </div>
              </div>

              <div className="control-card control-card-accent">
                <p className="panel-label">After the debate</p>
                <h3>Save, rate, and share configurations that produce the best results.</h3>
                <p className="control-copy">
                  Save debate configurations, rate the quality of each debate,
                  track which model combinations perform best, and publish your
                  strongest configs for the community.
                </p>
                <div className="chip-row">
                  <span>Save configs</span>
                  <span>Rate debates</span>
                  <span>Share publicly</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section trust-section" id="trust">
          <div className="cta-card">
            <div className="cta-copy">
              <p className="section-kicker">Why debate</p>
              <h2>Single-model answers are often wrong. Debate finds the errors before you act.</h2>
              <p>
                When models are forced to defend their reasoning against other models,
                weak arguments collapse, edge cases surface, and the surviving answer
                is the one that actually holds up under scrutiny.
              </p>
            </div>

            <div className="cta-points">
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Configurable debate depth (1-4 rounds)</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Role-based specialization per model</span>
              </div>
              <div className="cta-point">
                <CheckCircle2 size={18} />
                <span>Full debate transcript with every argument</span>
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
