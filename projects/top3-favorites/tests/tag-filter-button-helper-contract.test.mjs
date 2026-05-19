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

function sourceImportsTagFilterButton(source) {
  return /import \{[^}]*tagFilterButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesTagFilterButton(source) {
  return /\btagFilterButton\(/.test(source)
}

function sourceUsesDirectTagChipButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]#[^'"]+['"]\s*\}\)/.test(source)
}

test('[E2E-Helper][tag-filter-button] E2E specs use shared tag filter button locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = sourceUsesTagFilterButton(source)
    const usesDirectTagChipButton = sourceUsesDirectTagChipButton(source)

    if (usesDirectTagChipButton) {
      offenders.push(`${relativePath(specUrl)}: direct #tag button locator`)
    }
    if (usesHelper && !sourceImportsTagFilterButton(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use tagFilterButton() so tag-chip accessible names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][tag-filter-button] helper owns tag chip accessible-name contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function tagFilterButton/, 'tests/e2e-helpers.ts should export tagFilterButton')
  assert.match(source, /`#\$\{tag\}`/, 'tagFilterButton should own the #tag accessible-name pattern')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name\s*\}\)/, 'tagFilterButton should return the shared button locator')
})
