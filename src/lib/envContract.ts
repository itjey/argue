type OpenRouterAuthMode = 'browser' | 'server'
type DeploymentSurface = 'pages' | 'local-server' | 'railway' | 'cloudflare'

type RuntimeEnvironment = {
  ALLOWED_ORIGINS?: string
  OPENROUTER_API_KEY?: string
  PORT?: string
  VITE_ALLOW_GUEST_MODE?: string
  VITE_BUSYTEX_BASE_PATH?: string
  VITE_OPENROUTER_API_BASE?: string
  VITE_OPENROUTER_AUTH_MODE?: string
  VITE_PUBLIC_BASE?: string
}

type RuntimeConfig = {
  guestModeEnabled: boolean
  busytexBasePath: string
  configuredOpenRouterApiBase: string
  openRouterAuthMode: OpenRouterAuthMode
  publicBase: string
}

type EnvValidationIssue = {
  level: 'error' | 'warning'
  key?: keyof RuntimeEnvironment
  message: string
}

type EnvValidationOptions = {
  strictSecrets?: boolean
}

type RuntimeEnvironmentInput = Readonly<Partial<RuntimeEnvironment>>

type EnvValidationReport = {
  surface: DeploymentSurface
  config: RuntimeConfig
  issues: EnvValidationIssue[]
}

const TRUE_BOOLEAN_FLAGS = new Set(['1', 'true', 'yes'])
const FALSE_BOOLEAN_FLAGS = new Set(['0', 'false', 'no'])

const SURFACE_PRESETS: Record<DeploymentSurface, Partial<RuntimeEnvironment>> = {
  pages: {
    VITE_OPENROUTER_AUTH_MODE: 'browser',
    VITE_PUBLIC_BASE: '/argue/',
  },
  'local-server': {
    VITE_OPENROUTER_AUTH_MODE: 'server',
    VITE_PUBLIC_BASE: '/',
  },
  railway: {
    VITE_OPENROUTER_AUTH_MODE: 'server',
    VITE_PUBLIC_BASE: '/',
  },
  cloudflare: {
    VITE_ALLOW_GUEST_MODE: 'true',
    VITE_BUSYTEX_BASE_PATH: 'https://itjey.github.io/argue/core/busytex',
    VITE_OPENROUTER_AUTH_MODE: 'server',
    VITE_PUBLIC_BASE: '/',
  },
}

function normalizeBooleanFlag(value?: string) {
  const normalized = value?.trim().toLowerCase()
  return normalized != null && TRUE_BOOLEAN_FLAGS.has(normalized)
}

function isRecognizedBooleanFlag(value?: string) {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return true
  }

  return TRUE_BOOLEAN_FLAGS.has(normalized) || FALSE_BOOLEAN_FLAGS.has(normalized)
}

function normalizeOpenRouterAuthMode(value?: string): OpenRouterAuthMode {
  return value?.trim().toLowerCase() === 'server' ? 'server' : 'browser'
}

function normalizeApiBase(value?: string) {
  return value?.trim().replace(/\/+$/, '') ?? ''
}

function normalizePublicBase(value?: string) {
  const trimmed = value?.trim() ?? ''

  if (!trimmed) {
    return ''
  }

  if (trimmed === '/') {
    return '/'
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function parseRuntimeConfig(env: RuntimeEnvironmentInput | undefined): RuntimeConfig {
  const openRouterAuthMode = normalizeOpenRouterAuthMode(env?.VITE_OPENROUTER_AUTH_MODE)
  const configuredOpenRouterApiBase = normalizeApiBase(env?.VITE_OPENROUTER_API_BASE)

  return {
    guestModeEnabled: normalizeBooleanFlag(env?.VITE_ALLOW_GUEST_MODE),
    busytexBasePath: normalizeApiBase(env?.VITE_BUSYTEX_BASE_PATH),
    configuredOpenRouterApiBase:
      configuredOpenRouterApiBase ||
      (openRouterAuthMode === 'server' ? '/api/v1' : ''),
    openRouterAuthMode,
    publicBase: normalizePublicBase(env?.VITE_PUBLIC_BASE),
  }
}

function isAbsoluteHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRootRelativePath(value: string) {
  return value.startsWith('/') && !value.startsWith('//')
}

function validatePathOrUrl(
  issues: EnvValidationIssue[],
  key: keyof RuntimeEnvironment,
  value: string,
) {
  if (isAbsoluteHttpUrl(value) || isRootRelativePath(value)) {
    return
  }

  issues.push({
    level: 'error',
    key,
    message: `${key} must be an absolute http(s) URL or a root-relative path.`,
  })
}

function validateAllowedOrigins(issues: EnvValidationIssue[], rawOrigins?: string) {
  const origins = rawOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (!origins || origins.length === 0) {
    return
  }

  for (const origin of origins) {
    if (isAbsoluteHttpUrl(origin)) {
      continue
    }

    issues.push({
      level: 'error',
      key: 'ALLOWED_ORIGINS',
      message: `ALLOWED_ORIGINS contains an invalid origin: ${origin}`,
    })
  }
}

function addMissingSecretIssue(
  issues: EnvValidationIssue[],
  strictSecrets: boolean,
  surface: DeploymentSurface,
) {
  issues.push({
    level: strictSecrets ? 'error' : 'warning',
    key: 'OPENROUTER_API_KEY',
    message: `OPENROUTER_API_KEY is missing for the ${surface} surface.`,
  })
}

function validateEnvironment(
  env: RuntimeEnvironmentInput,
  surface: DeploymentSurface,
  options: EnvValidationOptions = {},
): EnvValidationReport {
  const strictSecrets = options.strictSecrets ?? false
  const issues: EnvValidationIssue[] = []
  const config = parseRuntimeConfig(env)
  const rawAuthMode = env.VITE_OPENROUTER_AUTH_MODE?.trim().toLowerCase()

  if (rawAuthMode && rawAuthMode !== 'browser' && rawAuthMode !== 'server') {
    issues.push({
      level: 'error',
      key: 'VITE_OPENROUTER_AUTH_MODE',
      message: 'VITE_OPENROUTER_AUTH_MODE must be either `browser` or `server`.',
    })
  }

  if (!isRecognizedBooleanFlag(env.VITE_ALLOW_GUEST_MODE)) {
    issues.push({
      level: 'error',
      key: 'VITE_ALLOW_GUEST_MODE',
      message: 'VITE_ALLOW_GUEST_MODE must be one of 1, true, yes, 0, false, or no.',
    })
  }

  if (env.VITE_PUBLIC_BASE) {
    const normalized = normalizePublicBase(env.VITE_PUBLIC_BASE)

    if (!isRootRelativePath(normalized)) {
      issues.push({
        level: 'error',
        key: 'VITE_PUBLIC_BASE',
        message: 'VITE_PUBLIC_BASE must be a root-relative path such as `/` or `/argue/`.',
      })
    }
  }

  if (env.VITE_OPENROUTER_API_BASE) {
    validatePathOrUrl(
      issues,
      'VITE_OPENROUTER_API_BASE',
      config.configuredOpenRouterApiBase,
    )
  }

  if (env.VITE_BUSYTEX_BASE_PATH) {
    validatePathOrUrl(issues, 'VITE_BUSYTEX_BASE_PATH', config.busytexBasePath)
  }

  validateAllowedOrigins(issues, env.ALLOWED_ORIGINS)

  if (surface === 'pages') {
    if (config.publicBase !== '/argue/') {
      issues.push({
        level: 'warning',
        key: 'VITE_PUBLIC_BASE',
        message: 'GitHub Pages should build with VITE_PUBLIC_BASE=/argue/.',
      })
    }

    if (
      config.openRouterAuthMode === 'server' &&
      (!config.configuredOpenRouterApiBase ||
        isRootRelativePath(config.configuredOpenRouterApiBase))
    ) {
      issues.push({
        level: 'error',
        key: 'VITE_OPENROUTER_API_BASE',
        message:
          'GitHub Pages cannot serve `/api/v1`; use browser mode or an absolute proxy URL.',
      })
    }
  }

  if (
    surface === 'local-server' ||
    surface === 'railway' ||
    surface === 'cloudflare'
  ) {
    if (config.openRouterAuthMode !== 'server') {
      issues.push({
        level: 'error',
        key: 'VITE_OPENROUTER_AUTH_MODE',
        message: `${surface} must build with VITE_OPENROUTER_AUTH_MODE=server.`,
      })
    }

    if (config.publicBase && config.publicBase !== '/') {
      issues.push({
        level: 'error',
        key: 'VITE_PUBLIC_BASE',
        message: `${surface} must build with VITE_PUBLIC_BASE=/ so static assets resolve correctly.`,
      })
    }

    if (
      config.configuredOpenRouterApiBase &&
      !isAbsoluteHttpUrl(config.configuredOpenRouterApiBase) &&
      config.configuredOpenRouterApiBase !== '/api/v1'
    ) {
      issues.push({
        level: 'error',
        key: 'VITE_OPENROUTER_API_BASE',
        message: `${surface} should use /api/v1 or an absolute proxy URL.`,
      })
    }

    if (!env.ALLOWED_ORIGINS?.trim()) {
      issues.push({
        level: 'warning',
        key: 'ALLOWED_ORIGINS',
        message: `${surface} should set ALLOWED_ORIGINS explicitly instead of relying on defaults.`,
      })
    }

    if (!env.OPENROUTER_API_KEY?.trim()) {
      addMissingSecretIssue(issues, strictSecrets, surface)
    }
  }

  return {
    surface,
    config,
    issues,
  }
}

function getSurfacePreset(surface: DeploymentSurface) {
  return { ...SURFACE_PRESETS[surface] }
}

export {
  getSurfacePreset,
  normalizeApiBase,
  normalizeBooleanFlag,
  normalizeOpenRouterAuthMode,
  normalizePublicBase,
  parseRuntimeConfig,
  validateEnvironment,
}

export type {
  DeploymentSurface,
  EnvValidationIssue,
  EnvValidationReport,
  OpenRouterAuthMode,
  RuntimeConfig,
  RuntimeEnvironment,
  RuntimeEnvironmentInput,
}
