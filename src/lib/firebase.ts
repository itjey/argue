import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type User,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyB8h5iGdtNu5C2BdBWh8x4NtAtvlVjs0p8',
  authDomain: 'cloak-df1d8.firebaseapp.com',
  projectId: 'cloak-df1d8',
  storageBucket: 'cloak-df1d8.firebasestorage.app',
  messagingSenderId: '127027902817',
  appId: '1:127027902817:web:f5cf0f56da880c1d68ed20',
  measurementId: 'G-9LDMTZ1WC0',
}

const app = initializeApp(firebaseConfig)

const auth = getAuth(app)
void setPersistence(auth, browserLocalPersistence)

const db = getFirestore(app)

type CreateAuthUriResponse = {
  authUri?: string
}

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

async function createGoogleSignInUrl(continueUri: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        continueUri,
        providerId: 'google.com',
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Unable to start Google sign-in (${response.status})`)
  }

  const data = (await response.json()) as CreateAuthUriResponse

  if (!data.authUri) {
    throw new Error('Google sign-in did not return an auth URL')
  }

  const authUrl = new URL(data.authUri)
  authUrl.searchParams.set('prompt', 'select_account')
  return authUrl.toString()
}

export {
  auth,
  createGoogleSignInUrl,
  db,
  getProviderIds,
  getProviderLabels,
  hasPasswordProvider,
  syncUserProfile,
}
