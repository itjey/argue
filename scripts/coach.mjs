#!/usr/bin/env node

/**
 * Argue Project Coach & Automation Manager
 * Full-stack debugging, deployment, and development automation
 * 
 * This script provides a complete interface for me (the AI) to:
 * - Debug any issue across the full stack
 * - Run comprehensive diagnostics
 * - Validate and deploy safely
 * - Execute development tasks
 * - Manage the entire workflow
 * 
 * Usage:
 *   node scripts/coach.mjs [action] [options]
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const ACTIONS = {
  'full-check': {
    description: 'Complete system health & readiness check',
    run: fullCheck,
  },
  'validate-and-deploy': {
    description: 'Validate code and prepare for deployment',
    run: validateAndDeploy,
  },
  'debug-issue': {
    description: 'Debug a reported issue - full investigation',
    run: debugIssue,
  },
  'build-and-test': {
    description: 'Build and test everything',
    run: buildAndTest,
  },
  'list-tasks': {
    description: 'Show all available coaching commands',
    run: listTasks,
  },
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
}

function log(level, ...args) {
  const icons = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    info: `${colors.cyan}ℹ${colors.reset}`,
    section: `${colors.blue}▶${colors.reset}`,
  }
  console.log(icons[level] || '•', ...args)
}

function section(title) {
  console.log(`\n${colors.bold}${colors.blue}${title}${colors.reset}`)
  console.log('─'.repeat(60))
}

function run(cmd, description) {
  if (description) log('info', description)
  try {
    const output = execSync(cmd, { encoding: 'utf-8' })
    return { success: true, output }
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout }
  }
}

async function fullCheck() {
  section('🔍 FULL SYSTEM CHECK')

  let allPass = true

  // Check 1: Dependencies
  section('Dependencies')
  const depCheck = run('npm list --depth=0 2>&1', 'Checking npm packages...')
  if (depCheck.success) {
    log('success', 'npm packages installed')
  } else {
    log('error', 'npm packages may have issues')
    allPass = false
  }

  // Check 2: Git
  section('Git Status')
  const gitCheck = run('git status --porcelain', 'Checking git status...')
  if (gitCheck.output.trim() === '') {
    log('success', 'Working tree clean, ready to deploy')
  } else {
    log('warn', 'Uncommitted changes detected')
  }

  // Check 3: TypeScript
  section('TypeScript Compilation')
  const tsCheck = run('npx tsc --noEmit 2>&1', 'Type checking...')
  if (tsCheck.success) {
    log('success', 'TypeScript compilation successful')
  } else {
    log('error', 'TypeScript errors found')
    console.log(tsCheck.output)
    allPass = false
  }

  // Check 4: Linting
  section('Code Quality (ESLint)')
  const lintCheck = run('npm run lint 2>&1', 'Linting code...')
  if (lintCheck.success) {
    log('success', 'Linting passed')
  } else {
    log('warn', 'Linting issues (can be auto-fixed: npm run lint:fix)')
  }

  // Check 5: Tests
  section('Test Suite')
  const testCheck = run('npm test 2>&1', 'Running tests...')
  if (testCheck.success) {
    log('success', 'All tests passed')
  } else {
    log('warn', 'Some tests failed (see details below)')
  }

  // Check 6: Build
  section('Production Build')
  const buildCheck = run('npm run build 2>&1', 'Building for production...')
  if (buildCheck.success) {
    log('success', 'Production build successful')
    const distExists = await fs.access('dist/index.html').then(() => true).catch(() => false)
    if (distExists) {
      log('success', 'dist/index.html verified')
    }
  } else {
    log('error', 'Build failed')
    console.log(buildCheck.output)
    allPass = false
  }

  // Check 7: Environment
  section('Environment Configuration')
  const envExists = await fs.access('.env.local').then(() => true).catch(() => false)
  if (envExists) {
    log('success', '.env.local configured')
  } else {
    log('warn', '.env.local not found (create with API keys)')
  }

  // Summary
  section('Summary')
  if (allPass) {
    log('success', 'All critical checks passed ✓')
    console.log(`\n${colors.green}Status: READY FOR DEPLOYMENT${colors.reset}`)
  } else {
    log('error', 'Some checks failed - fix issues before deployment')
    console.log(`\n${colors.red}Status: NOT READY${colors.reset}`)
  }
}

async function validateAndDeploy() {
  section('🚀 VALIDATE & PREPARE DEPLOYMENT')

  const checks = [
    { name: 'Git status', cmd: 'git status --porcelain' },
    { name: 'TypeScript', cmd: 'npx tsc --noEmit 2>&1' },
    { name: 'Linting', cmd: 'npm run lint 2>&1' },
    { name: 'Tests', cmd: 'npm test 2>&1' },
    { name: 'Build', cmd: 'npm run build 2>&1' },
  ]

  let allPass = true
  for (const check of checks) {
    process.stdout.write(`${colors.cyan}○${colors.reset} ${check.name} ... `)
    const result = run(check.cmd)
    if (result.success && check.name === 'Git status' && result.output.trim() === '') {
      console.log(`${colors.green}✓${colors.reset}`)
    } else if (result.success) {
      console.log(`${colors.green}✓${colors.reset}`)
    } else {
      console.log(`${colors.red}✗${colors.reset}`)
      allPass = false
    }
  }

  section('Deployment Status')
  if (allPass) {
    log('success', 'All checks passed - code is deployment ready')
    console.log(`\n${colors.bold}Next: git push${colors.reset}`)
    console.log('GitHub Actions will handle deployment automatically\n')
  } else {
    log('error', 'Fix issues above before deploying')
    process.exit(1)
  }
}

async function buildAndTest() {
  section('🧪 BUILD & TEST')

  const result1 = run('npm test 2>&1', 'Running test suite...')
  if (!result1.success) {
    log('error', 'Tests failed')
    console.log(result1.output)
    process.exit(1)
  }
  log('success', 'Tests passed')

  const result2 = run('npm run build 2>&1', 'Building for production...')
  if (!result2.success) {
    log('error', 'Build failed')
    console.log(result2.output)
    process.exit(1)
  }
  log('success', 'Build successful')

  section('Summary')
  log('success', 'Tests and build both successful')
}

async function debugIssue() {
  section('🐛 INVESTIGATION MODE')

  console.log(`
${colors.bold}Collecting diagnostic information...${colors.reset}

Use this to help debug issues. This will gather:
- Environment configuration
- Recent git history
- Build status
- Test results
- Network connectivity
- System information
`)

  section('Environment')
  const envResult = run('node scripts/debug.mjs inspect:env')
  console.log(envResult.output)

  section('Build Status')
  const buildResult = run('node scripts/debug.mjs inspect:build')
  console.log(buildResult.output)

  section('Network Connectivity')
  const networkResult = run('node scripts/debug.mjs inspect:network')
  console.log(networkResult.output)

  section('Git History')
  run('git log --oneline -10')

  section('Test Results')
  run('npm test 2>&1')
}

async function listTasks() {
  section('📋 AVAILABLE COMMANDS')

  console.log(`\nUsage: node scripts/coach.mjs [action]\n`)
  console.log(`${colors.bold}Actions:${colors.reset}`)

  for (const [key, action] of Object.entries(ACTIONS)) {
    console.log(`  ${colors.cyan}${key.padEnd(25)}${colors.reset}${action.description}`)
  }

  console.log(`\n${colors.bold}Quick Reference:${colors.reset}`)
  console.log(`  node scripts/coach.mjs full-check           # Check everything`)
  console.log(`  node scripts/coach.mjs validate-and-deploy  # Pre-deployment check`)
  console.log(`  node scripts/coach.mjs build-and-test       # Build and test`)
  console.log(`  node scripts/coach.mjs debug-issue          # Full diagnostics`)
}

// Main
const action = process.argv[2] || 'full-check'

if (!ACTIONS[action]) {
  console.log(`Unknown action: ${action}\n`)
  await listTasks()
  process.exit(1)
}

console.log(`${colors.bold}${colors.blue}Argue Project Coach${colors.reset}\n`)

try {
  await ACTIONS[action].run()
} catch (err) {
  log('error', 'Unexpected error:', err.message)
  process.exit(1)
}
