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

function sourceImportsEditSaveHelper(source) {
  return /import \{[^}]*editSaveButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectEditSaveButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]編集を保存['"]\s*\}\)/.test(source)
}

function collectEditSaveRaceOffenders(spec, source) {
  const riskyNextActions = [
    "request.get('/api/items'",
    'request.get("/api/items"',
    'page.reload(',
    'downloadJsonExport(',
    'uploadJsonImportFile(',
  ]
  const offenders = []
  const saveClickPattern = /await\s+editSaveButton\(page\)\.click\(\)/g
  const matches = [...source.matchAll(saveClickPattern)]

  for (const match of matches) {
    const start = match.index + match[0].length
    const nextSaveIndex = source.indexOf('editSaveButton(page).click()', start)
    const block = source.slice(start, nextSaveIndex === -1 ? undefined : nextSaveIndex)
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

test('[E2E-Helper][edit-save] E2E specs use shared edit save button locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesEditSaveHelper = /editSaveButton\(/.test(source)
    const usesDirectEditSaveButton = sourceUsesDirectEditSaveButton(source)

    if (usesDirectEditSaveButton) {
      offenders.push(`${relativePath(specUrl)}: direct edit save button locator`)
    }
    if (usesEditSaveHelper && !sourceImportsEditSaveHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use editSaveButton() so the edit save accessible name stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][edit-save] helper owns edit save button accessible name', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function editSaveButton/, 'tests/e2e-helpers.ts should export editSaveButton')
  assert.match(source, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]編集を保存['"]\s*\}\)/, 'editSaveButton should own the edit save button accessible name')
})

test('[E2E-Helper][edit-save] risky post-edit workflows wait for save completion', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const source = await readFile(new URL(spec, `${root}/`), 'utf8')
    offenders.push(...collectEditSaveRaceOffenders(spec, source))
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs that edit-save and then start another workflow should wait for the edit success live-region first: ${offenders.join(', ')}`,
  )
})
