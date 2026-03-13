import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const cloudflareEnv = {
  ...process.env,
  VITE_ALLOW_GUEST_MODE: 'true',
  VITE_BUSYTEX_BASE_PATH: 'https://itjey.github.io/argue/core/busytex',
  VITE_OPENROUTER_AUTH_MODE: 'server',
  VITE_PUBLIC_BASE: '/',
}

const buildResult = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build'],
  {
    cwd: projectRoot,
    env: cloudflareEnv,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
)

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1)
}

rmSync(join(projectRoot, 'dist', 'core', 'busytex'), {
  force: true,
  recursive: true,
})

rmSync(join(projectRoot, 'dist', '_redirects'), {
  force: true,
})
