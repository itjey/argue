#!/usr/bin/env node

/**
 * Enhanced Debugging Utility
 * Provides comprehensive debugging, logging, and diagnostics
 * 
 * Usage:
 *   node scripts/debug.mjs [command] [options]
 * 
 * Commands:
 *   - inspect:env      Show environment configuration
 *   - inspect:build    Verify build artifacts
 *   - inspect:network  Check API connectivity
 *   - trace:api        Trace API requests with timing
 *   - validate:all     Run all validation checks
 *   - logs:server      Follow server logs
 *   - health:check     Full system health check
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(level, ...args) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
  const prefix = {
    info: `${colors.cyan}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    debug: `${colors.gray}»${colors.reset}`,
  }[level] || '•'
  
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${prefix}`, ...args)
}

async function inspectEnv() {
  log('info', 'Environment Configuration')
  console.log('─'.repeat(50))

  try {
    const envFile = path.join(process.cwd(), '.env.local')
    const hasEnv = await fs.access(envFile).then(() => true).catch(() => false)
    
    if (!hasEnv) {
      log('warn', '.env.local not found - using defaults')
      return
    }

    const content = await fs.readFile(envFile, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    
    lines.forEach(line => {
      const [key, value] = line.split('=')
      const masked = value?.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value || '(empty)'
      log('debug', `${key.padEnd(20)} = ${masked}`)
    })
  } catch (err) {
    log('error', 'Failed to read .env.local:', err.message)
  }
}

async function inspectBuild() {
  log('info', 'Build Artifacts Analysis')
  console.log('─'.repeat(50))

  const distPath = path.join(process.cwd(), 'dist')
  
  try {
    const stats = await fs.stat(distPath)
    if (!stats.isDirectory()) {
      log('error', 'dist/ is not a directory')
      return
    }

    const files = await fs.readdir(distPath, { recursive: true })
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(distPath, file)
        const stat = await fs.stat(filePath)
        return { file, size: stat.size, isDir: stat.isDirectory() }
      })
    )

    const htmlFiles = fileStats.filter(f => f.file.endsWith('.html'))
    const jsFiles = fileStats.filter(f => f.file.endsWith('.js'))
    const cssFiles = fileStats.filter(f => f.file.endsWith('.css'))
    const totalSize = fileStats.reduce((sum, f) => sum + f.size, 0)

    log('success', `Build directory contains ${files.length} files`)
    log('debug', `  HTML files: ${htmlFiles.length}`)
    log('debug', `  JS bundles: ${jsFiles.length}`)
    log('debug', `  CSS files: ${cssFiles.length}`)
    log('debug', `  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)

    if (!htmlFiles.some(f => f.file.endsWith('index.html'))) {
      log('error', 'dist/index.html is missing!')
    } else {
      log('success', 'dist/index.html found')
    }
  } catch (err) {
    log('error', 'Build directory not found. Run: npm run build')
  }
}

async function networkCheck() {
  log('info', 'Network & API Connectivity')
  console.log('─'.repeat(50))

  const endpoints = [
    { name: 'OpenRouter API', url: 'https://openrouter.ai/api/v1/models' },
    { name: 'GitHub Pages', url: 'https://itjey.github.io/argue/' },
    { name: 'Firebase', url: 'https://firestore.googleapis.com/' },
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, { method: 'HEAD', timeout: 5000 })
      log('success', `${endpoint.name}: ${response.status} ${response.statusText}`)
    } catch (err) {
      log('error', `${endpoint.name}: ${err.message}`)
    }
  }
}

async function validateAll() {
  log('info', 'Running comprehensive validation')
  console.log('─'.repeat(50))

  const checks = [
    { name: 'Node version', cmd: 'node --version' },
    { name: 'npm version', cmd: 'npm --version' },
    { name: 'TypeScript', cmd: 'npx tsc --version' },
    { name: 'Git status', cmd: 'git status --porcelain | wc -l' },
  ]

  for (const check of checks) {
    try {
      const output = execSync(check.cmd, { encoding: 'utf-8' }).trim()
      log('success', `${check.name}: ${output}`)
    } catch (err) {
      log('error', `${check.name}: ${err.message}`)
    }
  }
}

function healthCheck() {
  log('info', 'System Health Check')
  console.log('─'.repeat(50))

  const checks = [
    { name: 'npm dependencies', test: () => fs.access('./node_modules') },
    { name: 'Git repository', test: () => fs.access('./.git') },
    { name: 'TypeScript config', test: () => fs.access('./tsconfig.json') },
    { name: 'Vite config', test: () => fs.access('./vite.config.ts') },
    { name: 'Source dir', test: () => fs.access('./src') },
    { name: 'Build output', test: () => fs.access('./dist') },
  ]

  return Promise.all(
    checks.map(async (check) => {
      try {
        await check.test()
        log('success', `${check.name}`)
      } catch {
        log('warn', `${check.name} - missing (may be okay)`)
      }
    })
  )
}

// Main
const command = process.argv[2] || 'health:check'

console.log(`\n${colors.blue}${colors.bright}Debug Assistant${colors.reset}\n`)

switch (command) {
  case 'inspect:env':
    await inspectEnv()
    break
  case 'inspect:build':
    await inspectBuild()
    break
  case 'inspect:network':
    await networkCheck()
    break
  case 'validate:all':
    await validateAll()
    break
  case 'health:check':
    await healthCheck()
    break
  default:
    console.log(`Unknown command: ${command}`)
    console.log('Available: inspect:env, inspect:build, inspect:network, validate:all, health:check')
    process.exit(1)
}

console.log()
