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

function sourceImportsItemDeleteHelper(source) {
  return /import \{[^}]*itemDeleteButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectItemDeleteButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*(?:`[^`]*を削除`|['"][^#'"][^'"]*を削除['"]|['"]削除['"]|\/[^/]*削除[^/]*\/)\s*\}\)/.test(source)
}

function collectItemDeleteRaceOffenders(spec, source) {
  const riskyNextActions = [
    "request.get('/api/items'",
    'request.get("/api/items"',
    "page.request.get('/api/items'",
    'page.request.get("/api/items"',
    'page.reload(',
    'downloadJsonExport(',
    'uploadJsonImportFile(',
  ]
  const offenders = []
  const deleteClickPattern = /await\s+itemDeleteButton\([^\n]+?\)\.click\(\)/g
  const matches = [...source.matchAll(deleteClickPattern)]

  for (const match of matches) {
    const start = match.index + match[0].length
    const nextDeleteIndex = source.indexOf('itemDeleteButton(', start)
    const block = source.slice(start, nextDeleteIndex === -1 ? undefined : nextDeleteIndex)
    const statusIndex = block.indexOf('expectOperationStatus(page,')
    const riskyAction = riskyNextActions.find((token) => block.includes(token))

    if (!riskyAction) {
      continue
    }
    if (statusIndex !== -1 && statusIndex < block.indexOf(riskyAction)) {
      continue
    }

    const line = source.slice(0, match.index).split('\n').length
    offenders.push(`${spec}:${line}: wait for expectOperationStatus(page, ...) before ${riskyAction}`)
  }

  return offenders
}

test('[E2E-Helper][item-delete-action] E2E specs use shared item delete action locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = /itemDeleteButton\(/.test(source)
    const usesDirectItemDeleteButton = sourceUsesDirectItemDeleteButton(source)

    if (usesDirectItemDeleteButton) {
      offenders.push(`${relativePath(specUrl)}: direct item delete action locator`)
    }
    if (usesHelper && !sourceImportsItemDeleteHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use itemDeleteButton() so item-specific delete accessible names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][item-delete-action] helper owns item delete action accessible-name contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function itemDeleteButton/, 'tests/e2e-helpers.ts should export itemDeleteButton')
  assert.match(source, /`\$\{itemName\}を削除`/, 'itemDeleteButton should own the item-name delete accessible-name pattern')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name\s*\}\)/, 'itemDeleteButton should return the shared button locator')
})

test('[E2E-Helper][item-delete-action] risky post-delete workflows wait for delete completion', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const source = await readFile(new URL(spec, `${root}/`), 'utf8')
    offenders.push(...collectItemDeleteRaceOffenders(spec, source))
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs that delete an item and then start another workflow should wait for the delete success live-region first: ${offenders.join(', ')}`,
  )
})
