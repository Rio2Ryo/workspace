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

function importsRegistrationSaveButton(source) {
  return /import \{[^}]*registrationSaveButton[^}]*\} from ['"](?:\.\.?\/)*e2e-helpers['"]/.test(source)
}

function sourceUsesDirectRegistrationSaveButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]DBに保存['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][registration-save] E2E specs use shared registration save button locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = /registrationSaveButton\(/.test(source)

    if (sourceUsesDirectRegistrationSaveButton(source)) {
      offenders.push(`${relativePath(specUrl)}: direct DBに保存 locator`)
    }
    if (usesHelper && !importsRegistrationSaveButton(source)) {
      offenders.push(`${relativePath(specUrl)}: registrationSaveButton call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use registrationSaveButton() so the registration save accessible name stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][registration-save] helper owns registration save accessible-name contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function registrationSaveButton/, 'tests/e2e-helpers.ts should export registrationSaveButton')
  assert.match(source, /name:\s*['"]DBに保存['"]/, 'registrationSaveButton should own the DB save accessible name')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]DBに保存['"]\s*\}\)/, 'registrationSaveButton should return the shared button locator')
})
