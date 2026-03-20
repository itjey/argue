import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type User,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAqHQ46s488VGbZpmTZetnLTyzDLemJFEU',
  authDomain: 'argue-app-2026.firebaseapp.com',
  projectId: 'argue-app-2026',
  storageBucket: 'argue-app-2026.firebasestorage.app',
  messagingSenderId: '589955566087',
  appId: '1:589955566087:web:023ddc973e2c4b48ad78a2',
}

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
  getProviderIds,
  getProviderLabels,
  hasPasswordProvider,
  syncUserProfile,
}
