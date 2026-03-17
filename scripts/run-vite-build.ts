import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import {
  getSurfacePreset,
  type DeploymentSurface,
} from '../src/lib/envContract.ts'

const projectRoot = process.cwd()
const buildSurface = (process.argv[2] as DeploymentSurface | undefined) ?? 'pages'
const supportedBuildSurfaces = new Set<DeploymentSurface>([
  'pages',
  'local-server',
  'cloudflare',
])

if (!supportedBuildSurfaces.has(buildSurface)) {
  console.error(`Unsupported build surface: ${buildSurface}`)
  process.exit(1)
}

const buildCommand =
  process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run build:app'],
      }
    : {
        command: 'npm',
        args: ['run', 'build:app'],
      }

const buildResult = spawnSync(buildCommand.command, buildCommand.args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    ...getSurfacePreset(buildSurface),
  },
  stdio: 'inherit',
})

if (buildResult.error) {
  console.error(buildResult.error.message)
  process.exit(1)
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1)
}

if (buildSurface === 'cloudflare') {
  rmSync(join(projectRoot, 'dist', 'core', 'busytex'), {
    force: true,
    recursive: true,
  })

  rmSync(join(projectRoot, 'dist', '_redirects'), {
    force: true,
  })
}
