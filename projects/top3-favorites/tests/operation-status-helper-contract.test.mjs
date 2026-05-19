import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(childUrl))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsOperationStatusHelper(source) {
  return /import \{[^}]*(?:operationStatus|expectOperationStatus)[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][operation-status] E2E specs use shared operation status helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesDirectStatusRole = /getByRole\(['"]status['"]\)/.test(source)
    const usesHelper = /(?:operationStatus|expectOperationStatus)\(/.test(source)

    if (usesDirectStatusRole) {
      offenders.push(`${relativePath(specUrl)}: direct operation status role locator`)
    }
    if (usesHelper && !importsOperationStatusHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: operation status helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use operationStatus()/expectOperationStatus() so the live-region locator stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][operation-status] helper owns status live-region locator and text assertion', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function operationStatus/, 'tests/e2e-helpers.ts should export operationStatus(page)')
  assert.match(source, /getByRole\(['"]status['"]\)/, 'operationStatus should own the role=status locator')
  assert.match(source, /export async function expectOperationStatus/, 'tests/e2e-helpers.ts should export expectOperationStatus(page, text)')
  assert.match(source, /expectOperationStatus[\s\S]*operationStatus\(page\)[\s\S]*toContainText\(text\)/, 'expectOperationStatus should assert text through operationStatus(page)')
})
