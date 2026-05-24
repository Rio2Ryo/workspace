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
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(new URL(entry.name, dirUrl)))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsOperationAlertHelper(source) {
  return /import \{[^}]*(?:operationAlert|expectOperationAlert|expectOperationAlertText)[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][operation-alert] E2E specs use shared operation alert helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesDirectAlertRole = /getByRole\(['"]alert['"]\)/.test(source)
    const usesHelper = /(?:operationAlert|expectOperationAlert)\(/.test(source)

    if (usesDirectAlertRole) {
      offenders.push(`${relativePath(specUrl)}: direct operation alert role locator`)
    }
    if (usesHelper && !importsOperationAlertHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: operation alert helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use operationAlert()/expectOperationAlert() so the error live-region locator stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][operation-alert] helper owns alert live-region locator and text assertion', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function operationAlert/, 'tests/e2e-helpers.ts should export operationAlert(page)')
  assert.match(source, /getByRole\(['"]alert['"]\)/, 'operationAlert should own the role=alert locator')
  assert.match(source, /export async function expectOperationAlert/, 'tests/e2e-helpers.ts should export expectOperationAlert(page, text)')
  assert.match(source, /expectOperationAlert[\s\S]*operationAlert\(page\)[\s\S]*toContainText\(text\)/, 'expectOperationAlert should assert text through operationAlert(page)')
  assert.match(source, /export async function expectOperationAlertText/, 'tests/e2e-helpers.ts should export expectOperationAlertText(page, text)')
  assert.match(source, /expectOperationAlertText[\s\S]*operationAlert\(page\)[\s\S]*toHaveText\(text\)/, 'expectOperationAlertText should assert exact alert text through operationAlert(page)')
})
