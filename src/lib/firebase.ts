import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type User,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB8h5iGdtNu5C2BdBWh8x4NtAtvlVjs0p8',
  authDomain: 'cloak-df1d8.firebaseapp.com',
  projectId: 'cloak-df1d8',
  storageBucket: 'cloak-df1d8.firebasestorage.app',
  messagingSenderId: '127027902817',
  appId: '1:127027902817:web:f5cf0f56da880c1d68ed20',
  measurementId: 'G-9LDMTZ1WC0',
}

function getFirebaseConfigValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

const firebaseConfig = {
  apiKey: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_API_KEY,
    DEFAULT_FIREBASE_CONFIG.apiKey,
  ),
  authDomain: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    DEFAULT_FIREBASE_CONFIG.authDomain,
  ),
  projectId: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    DEFAULT_FIREBASE_CONFIG.projectId,
  ),
  storageBucket: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    DEFAULT_FIREBASE_CONFIG.storageBucket,
  ),
  messagingSenderId: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  ),
  appId: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_APP_ID,
    DEFAULT_FIREBASE_CONFIG.appId,
  ),
  measurementId: getFirebaseConfigValue(
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    DEFAULT_FIREBASE_CONFIG.measurementId,
  ),
}

const firebaseProjectId = firebaseConfig.projectId

const app = initializeApp(firebaseConfig)

const auth = getAuth(app)
void setPersistence(auth, browserLocalPersistence)

const db = getFirestore(app)

type SyncUserProfileOptions = {
  lastAuthMethod?: string
  linkedProvider?: string
  verificationEmailRequested?: boolean
}

function getProviderIds(user: User | null) {
  if (!user) {
    return []
  }

  return Array.from(
    new Set(
      user.providerData
        .map((provider) => provider.providerId)
        .filter((providerId): providerId is string => Boolean(providerId)),
    ),
  )
}

function getProviderLabels(user: User | null) {
  return getProviderIds(user).map((providerId) => {
    if (providerId === 'google.com') {
      return 'Google'
    }

    if (providerId === 'password') {
      return 'Email + password'
    }

    return providerId
  })
}

function hasPasswordProvider(user: User | null) {
  return getProviderIds(user).includes('password')
}

function getFirestoreRecoveryMessage(error: unknown, fallback: string) {
  const code =
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : ''

  switch (code) {
    case 'resource-exhausted':
      return `Firestore is over quota on ${firebaseProjectId}, so chats and configs may not load or save until quota resets or the app switches projects.`
    case 'permission-denied':
      return 'Firestore rejected this request. Check the signed-in account and Firestore rules.'
    case 'unavailable':
      return 'Firestore is temporarily unavailable. Check your network and try again.'
    case 'failed-precondition':
      return 'Firestore is missing a required index or backend dependency for this view.'
    default:
      return fallback
  }
}

async function syncUserProfile(user: User, options: SyncUserProfileOptions = {}) {
  const profileRef = doc(db, 'users', user.uid)
  const existingProfile = await getDoc(profileRef)

  const profilePayload: Record<string, unknown> = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    emailVerified: user.emailVerified,
    providers: getProviderIds(user),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }

  if (!existingProfile.exists()) {
    profilePayload.createdAt = serverTimestamp()
  }

  if (options.lastAuthMethod) {
    profilePayload.lastAuthMethod = options.lastAuthMethod
  }

  if (options.linkedProvider) {
    profilePayload.lastLinkedProvider = options.linkedProvider
  }

  if (options.verificationEmailRequested) {
    profilePayload.lastVerificationEmailAt = serverTimestamp()
  }

  await setDoc(profileRef, profilePayload, { merge: true })
}

export {
  auth,
  db,
  firebaseProjectId,
  getProviderIds,
  getProviderLabels,
  getFirestoreRecoveryMessage,
  hasPasswordProvider,
  syncUserProfile,
}
