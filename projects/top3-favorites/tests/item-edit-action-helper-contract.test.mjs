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

function sourceImportsItemEditHelper(source) {
  return /import \{[^}]*itemEditButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectItemEditButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*(?:`[^`]*を編集`|['"][^'"]*を編集['"]|\/[^/]*編集[^/]*\/)\s*\}\)/.test(source)
}

test('[E2E-Helper][item-edit-action] E2E specs use shared item edit action locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = /itemEditButton\(/.test(source)
    const usesDirectItemEditButton = sourceUsesDirectItemEditButton(source)

    if (usesDirectItemEditButton) {
      offenders.push(`${relativePath(specUrl)}: direct item edit action locator`)
    }
    if (usesHelper && !sourceImportsItemEditHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use itemEditButton() so item-specific edit accessible names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][item-edit-action] helper owns item edit action accessible-name contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function itemEditButton/, 'tests/e2e-helpers.ts should export itemEditButton')
  assert.match(source, /`\$\{itemName\}を編集`/, 'itemEditButton should own the item-name edit accessible-name pattern')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name\s*\}\)/, 'itemEditButton should return the shared button locator')
})
