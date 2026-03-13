/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_GUEST_MODE?: string
  readonly VITE_BUSYTEX_BASE_PATH?: string
  readonly VITE_OPENROUTER_API_BASE?: string
  readonly VITE_OPENROUTER_AUTH_MODE?: 'browser' | 'server'
  readonly VITE_PUBLIC_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
