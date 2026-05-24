import { spawn, execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 4180
const DYNAMIC_PORT_BASE = 4200
const DYNAMIC_PORT_SPAN = 1000

export function dynamicPreviewPort({ pid = process.pid } = {}) {
  return DYNAMIC_PORT_BASE + (Number(pid) % DYNAMIC_PORT_SPAN)
}

export function resolvePreviewPort(env = process.env, { pid = process.pid } = {}) {
  return Number.parseInt(env.E2E_PREVIEW_PORT || env.PORT || `${dynamicPreviewPort({ pid })}`, 10)
}

export function staleProcessCleanupPatterns() {
  return [
    'playwright test',
    'pnpm exec playwright',
    'scripts/preview-local.mjs',
    'node scripts/run-playwright-clean.mjs',
  ]
}

export function previewCleanupCommands({ port = DEFAULT_PORT } = {}) {
  return [`lsof -tiTCP:${port} -sTCP:LISTEN`, 'kill <pids>', `wait-port-empty ${port}`]
}

export function buildPlaywrightArgs(args = []) {
  return ['exec', 'playwright', 'test', ...args]
}

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve(String(stdout || ''))
    })
  })
}

function startPreviewServer(port, { log = console.error } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', `rm -f data.local.json && pnpm build && HOST=::1 PORT=${port} node scripts/preview-local.mjs`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let settled = false
    const failTimer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`preview server did not announce readiness on ${port}`))
    }, 120_000)

    const handleOutput = (chunk) => {
      const text = String(chunk)
      log(text.trimEnd())
      if (!settled && text.includes('[top3-local]')) {
        settled = true
        clearTimeout(failTimer)
        resolve(child)
      }
    }

    child.stdout.on('data', handleOutput)
    child.stderr.on('data', handleOutput)
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(failTimer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(failTimer)
      reject(new Error(`preview server exited before readiness with code ${code ?? 1}`))
    })
  })
}

async function listeningPids(port) {
  try {
    const stdout = await execFileText('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'])
    return stdout.split(/\s+/).map((value) => value.trim()).filter(Boolean)
  } catch (error) {
    if (error?.code === 1) return []
    throw error
  }
}

async function staleProcessPids({ patterns = staleProcessCleanupPatterns() } = {}) {
  const stdout = await execFileText('ps', ['-axo', 'pid=,command='])
  const selfPid = String(process.pid)
  const parentPid = String(process.ppid)
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+([\s\S]+)$/.exec(line)
      return match ? { pid: match[1], command: match[2] } : null
    })
    .filter(Boolean)
    .filter(({ pid, command }) => pid !== selfPid && pid !== parentPid && patterns.some((pattern) => command.includes(pattern)))
    .map(({ pid }) => pid)
}

export async function cleanupStaleProcessFamilies({ log = console.error } = {}) {
  const pids = await staleProcessPids()
  if (pids.length === 0) return []

  log(`[top3-e2e-clean] killing stale Playwright/preview process families: ${pids.join(', ')}`)
  await execFileText('kill', pids).catch(async (error) => {
    const remaining = await staleProcessPids()
    if (remaining.length > 0) throw error
  })
  return pids
}

async function waitForPortEmpty(port, { attempts = 20, intervalMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pids = await listeningPids(port)
    if (pids.length === 0) return
    await delay(intervalMs)
  }
  const pids = await listeningPids(port)
  throw new Error(`preview port ${port} is still busy: ${pids.join(', ')}`)
}

export async function cleanupPreviewPort({ port = DEFAULT_PORT, log = console.error } = {}) {
  const pids = await listeningPids(port)
  if (pids.length === 0) return []

  log(`[top3-e2e-clean] killing stale preview listeners on ${port}: ${pids.join(', ')}`)
  await execFileText('kill', pids).catch(async (error) => {
    const remaining = await listeningPids(port)
    if (remaining.length > 0) throw error
  })
  await waitForPortEmpty(port)
  return pids
}

export async function runPlaywrightClean(args = process.argv.slice(2), options = {}) {
  const port = resolvePreviewPort(process.env)
  const log = options.log || console.error

  await cleanupStaleProcessFamilies({ log })
  await cleanupPreviewPort({ port, log })
  const server = await startPreviewServer(port, { log })
  const pnpmArgs = buildPlaywrightArgs(args)
  const result = await new Promise((resolve) => {
    const child = spawn('pnpm', pnpmArgs, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, HOST: '::1', PORT: String(port), PLAYWRIGHT_EXTERNAL_SERVER: '1' },
    })
    child.on('close', (code, signal) => resolve({ code: code ?? 1, signal }))
    child.on('error', (error) => {
      log(`[top3-e2e-clean] failed to start playwright: ${error.message}`)
      resolve({ code: 1, signal: null })
    })
  })
  server.kill()
  await cleanupPreviewPort({ port, log })
  await cleanupStaleProcessFamilies({ log })
  return result.code
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  runPlaywrightClean().then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
