import {
  getSurfacePreset,
  validateEnvironment,
  type DeploymentSurface,
  type EnvValidationIssue,
} from '../src/lib/envContract.ts'

const rawArgs = process.argv.slice(2)
const strictSecrets = rawArgs.includes('--strict-secrets')
const surfaceArgIndex = rawArgs.findIndex((value) => value === '--surface')
const requestedSurface =
  surfaceArgIndex >= 0 ? (rawArgs[surfaceArgIndex + 1] as DeploymentSurface | undefined) : undefined

const surfaces: DeploymentSurface[] = requestedSurface
  ? [requestedSurface]
  : ['pages', 'local-server', 'railway', 'cloudflare']

function sortIssue(left: EnvValidationIssue, right: EnvValidationIssue) {
  if (left.level !== right.level) {
    return left.level === 'error' ? -1 : 1
  }

  return (left.key ?? '').localeCompare(right.key ?? '')
}

let errorCount = 0

for (const surface of surfaces) {
  const report = validateEnvironment(
    {
      ...process.env,
      ...getSurfacePreset(surface),
    },
    surface,
    { strictSecrets },
  )

  console.log(`\n[${surface}]`)
  console.log(
    `auth=${report.config.openRouterAuthMode} base=${report.config.publicBase || '(default)'} api=${report.config.configuredOpenRouterApiBase || '(none)'}`,
  )

  if (report.issues.length === 0) {
    console.log('  OK')
    continue
  }

  for (const issue of report.issues.sort(sortIssue)) {
    if (issue.level === 'error') {
      errorCount += 1
    }

    const keyPrefix = issue.key ? `${issue.key}: ` : ''
    console.log(`  ${issue.level.toUpperCase()}: ${keyPrefix}${issue.message}`)
  }
}

if (errorCount > 0) {
  process.exit(1)
}
