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

function sourceImportsJsonImportHelper(source) {
  return /import \{[^}]*jsonImportButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectJsonImportButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]JSONインポート['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][json-import-trigger] E2E specs use shared JSON import trigger locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = /jsonImportButton\(/.test(source)
    const usesDirectJsonImportButton = sourceUsesDirectJsonImportButton(source)

    if (usesDirectJsonImportButton) {
      offenders.push(`${relativePath(specUrl)}: direct JSON import trigger locator`)
    }
    if (usesHelper && !sourceImportsJsonImportHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use jsonImportButton() so the JSON import trigger accessible name stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][json-import-trigger] helper owns JSON import trigger accessible-name contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function jsonImportButton/, 'tests/e2e-helpers.ts should export jsonImportButton')
  assert.match(source, /name:\s*['"]JSONインポート['"]/, 'jsonImportButton should own the JSON import trigger accessible name')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]JSONインポート['"]\s*\}\)/, 'jsonImportButton should return the shared button locator')
})
