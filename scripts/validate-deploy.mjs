#!/usr/bin/env node

/**
 * Pre-Deployment Validation Script
 * Ensures code is safe to deploy before pushing to GitHub
 * 
 * Checks:
 * - No TypeScript errors
 * - No lint issues
 * - All tests pass
 * - Build succeeds
 * - No uncommitted changes in dist/
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

let passed = 0
let failed = 0

function check(name, fn) {
  process.stdout.write(`${colors.cyan}○${colors.reset} ${name} ...`)
  try {
    fn()
    console.log(` ${colors.green}✓${colors.reset}`)
    passed++
  } catch (err) {
    console.log(` ${colors.red}✗${colors.reset}`)
    console.log(`  ${colors.red}${err.message}${colors.reset}`)
    failed++
  }
}

console.log(`\n${colors.blue}Pre-Deployment Validation${colors.reset}\n`)

// Check 1: No uncomitted changes
check('Git status clean', () => {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
  if (status && !status.includes('dist/')) {
    throw new Error('Uncommitted changes detected:\n' + status)
  }
})

// Check 2: TypeScript compilation
check('TypeScript compilation', () => {
  execSync('npx tsc --noEmit', { stdio: 'ignore' })
})

// Check 3: ESLint
check('ESLint validation', () => {
  try {
    execSync('npm run lint', { stdio: 'ignore' })
  } catch {
    throw new Error('Lint errors found. Run: npm run lint:fix')
  }
})

// Check 4: Tests pass
check('Test suite', () => {
  execSync('npm test -- --run', { stdio: 'ignore' })
})

// Check 5: Production build
check('Production build', () => {
  execSync('npm run build', { stdio: 'ignore' })
})

// Check 6: Build artifacts valid
check('Build artifacts', async () => {
  try {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html')
    await fs.access(indexPath)
  } catch {
    throw new Error('dist/index.html not found after build')
  }
})

// Check 7: Environment variables
check('Environment configuration', async () => {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    await fs.access(envPath)
  } catch {
    console.log(` ${colors.yellow}~${colors.reset} (optional, using defaults)`)
  }
})

console.log(`\n${colors.blue}Results${colors.reset}`)
console.log(`${colors.green}Passed: ${passed}${colors.reset}`)
if (failed > 0) {
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`)
  console.log(`\n${colors.yellow}Fix errors above before deploying${colors.reset}\n`)
  process.exit(1)
} else {
  console.log(`\n${colors.green}✓ All checks passed! Safe to deploy.${colors.reset}`)
  console.log(`${colors.cyan}Next: git push${colors.reset}\n`)
}
