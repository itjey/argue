import { parseRuntimeConfig, type OpenRouterAuthMode } from './envContract'

const runtimeConfig = parseRuntimeConfig({
  VITE_ALLOW_GUEST_MODE: import.meta.env.VITE_ALLOW_GUEST_MODE,
  VITE_BUSYTEX_BASE_PATH: import.meta.env.VITE_BUSYTEX_BASE_PATH,
  VITE_OPENROUTER_API_BASE: import.meta.env.VITE_OPENROUTER_API_BASE,
  VITE_OPENROUTER_AUTH_MODE: import.meta.env.VITE_OPENROUTER_AUTH_MODE,
  VITE_PUBLIC_BASE: import.meta.env.VITE_PUBLIC_BASE,
})

function getConfiguredOpenRouterApiBase() {
  return runtimeConfig.configuredOpenRouterApiBase
}

function isServerManagedOpenRouter() {
  return runtimeConfig.openRouterAuthMode === 'server'
}

function isBrowserManagedOpenRouter() {
  return runtimeConfig.openRouterAuthMode === 'browser'
}

function isGuestModeEnabled() {
  return runtimeConfig.guestModeEnabled
}

export {
  getConfiguredOpenRouterApiBase,
  isBrowserManagedOpenRouter,
  isGuestModeEnabled,
  isServerManagedOpenRouter,
}

export type { OpenRouterAuthMode }
