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

function collectSaveRaceOffenders(spec, source) {
  const riskyNextActions = [
    'uploadJsonImportFile(',
    "request.get('/api/items'",
    'request.get("/api/items"',
    'page.reload(',
    'downloadJsonExport(',
    'page.waitForEvent(',
    'tagFilterButton(',
  ]
  const offenders = []
  const saveClickPattern = /await\s+registrationSaveButton\(page\)\.click\(\)/g
  const matches = [...source.matchAll(saveClickPattern)]

  for (const match of matches) {
    const start = match.index + match[0].length
    const nextSaveIndex = source.indexOf('registrationSaveButton(page).click()', start)
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

test('[E2E-Helper][registration-save] risky post-save workflows wait for save completion', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const source = await readFile(new URL(spec, `${root}/`), 'utf8')
    offenders.push(...collectSaveRaceOffenders(spec, source))
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs that save and then start another workflow should wait for the save success live-region first: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][registration-save] import-invalid-after-valid waits for save completion before import upload', async () => {
  const specUrl = new URL('tests/import-invalid-after-valid-clears-preview.e2e.spec.ts', `${root}/`)
  const source = await readFile(specUrl, 'utf8')

  assert.match(source, /expectOperationStatus\(page, ['"]カフェラテ の1位に保存しました。['"]\)/, 'the flaky import-after-save regression spec should wait for the save success live-region before uploading import files')
  assert.match(source, /registrationSaveButton\(page\)\.click\(\)[\s\S]*expectOperationStatus\(page, ['"]カフェラテ の1位に保存しました。['"]\)[\s\S]*uploadJsonImportFile\(page, ['"]valid\.json['"]/, 'save click, save completion assertion, and import upload should stay in that order')
})
