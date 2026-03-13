type OpenRouterAuthMode = 'browser' | 'server'

function normalizeBooleanFlag(value?: string) {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeOpenRouterAuthMode(value?: string): OpenRouterAuthMode {
  return value?.trim().toLowerCase() === 'server' ? 'server' : 'browser'
}

function normalizeApiBase(value?: string) {
  return value?.trim().replace(/\/+$/, '') ?? ''
}

const openRouterAuthMode = normalizeOpenRouterAuthMode(
  import.meta.env.VITE_OPENROUTER_AUTH_MODE,
)

const configuredOpenRouterApiBase = normalizeApiBase(
  import.meta.env.VITE_OPENROUTER_API_BASE,
)

function getConfiguredOpenRouterApiBase() {
  if (configuredOpenRouterApiBase) {
    return configuredOpenRouterApiBase
  }

  if (openRouterAuthMode === 'server') {
    return '/api/v1'
  }

  return ''
}

function isServerManagedOpenRouter() {
  return openRouterAuthMode === 'server'
}

function isBrowserManagedOpenRouter() {
  return openRouterAuthMode === 'browser'
}

function isGuestModeEnabled() {
  return normalizeBooleanFlag(import.meta.env.VITE_ALLOW_GUEST_MODE)
}

export {
  getConfiguredOpenRouterApiBase,
  isBrowserManagedOpenRouter,
  isGuestModeEnabled,
  isServerManagedOpenRouter,
}

export type { OpenRouterAuthMode }
