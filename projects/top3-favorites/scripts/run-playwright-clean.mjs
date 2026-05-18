import { spawn, execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 4180

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

async function listeningPids(port) {
  try {
    const stdout = await execFileText('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'])
    return stdout.split(/\s+/).map((value) => value.trim()).filter(Boolean)
  } catch (error) {
    if (error?.code === 1) return []
    throw error
  }
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
  const port = Number.parseInt(process.env.E2E_PREVIEW_PORT || process.env.PORT || `${DEFAULT_PORT}`, 10)
  const log = options.log || console.error

  await cleanupPreviewPort({ port, log })
  const pnpmArgs = buildPlaywrightArgs(args)
  const result = await new Promise((resolve) => {
    const child = spawn('pnpm', pnpmArgs, { stdio: 'inherit', shell: false })
    child.on('close', (code, signal) => resolve({ code: code ?? 1, signal }))
    child.on('error', (error) => {
      log(`[top3-e2e-clean] failed to start playwright: ${error.message}`)
      resolve({ code: 1, signal: null })
    })
  })
  await cleanupPreviewPort({ port, log })
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
