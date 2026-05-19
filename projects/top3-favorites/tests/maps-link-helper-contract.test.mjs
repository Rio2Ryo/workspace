import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(childUrl)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][maps-link] E2E specs use shared Maps link locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directMapsLink = /getByRole\(['"]link['"],\s*\{\s*name:\s*['"]Mapsで開く['"]\s*\}\)/.test(source)
    const usesHelper = /mapsLink\(/.test(source)

    if (directMapsLink) offenders.push(`${path}: direct Maps link accessible-name locator`)
    if (usesHelper && !importsHelper(source, 'mapsLink')) {
      offenders.push(`${path}: mapsLink call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use mapsLink(scope) so the Maps link accessible name is centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][maps-link] helper owns the Maps link accessible name', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function mapsLink\(scope: Page \| Locator\): Locator/, 'tests/e2e-helpers.ts should export mapsLink(scope)')
  assert.match(source, /mapsLink[\s\S]*getByRole\(['"]link['"],\s*\{\s*name:\s*['"]Mapsで開く['"]\s*\}\)/, 'mapsLink should own the Maps link accessible name')
})

test('[App][config-quality] full verification runs Maps link helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(pkg.scripts['test:maps-link-helper-contract'], 'node --test tests/maps-link-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:maps-link-helper-contract/, 'pnpm test:full should include the Maps link helper contract')
})
