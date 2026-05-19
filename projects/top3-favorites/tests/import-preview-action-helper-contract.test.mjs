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

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from ['\"](?:\\.\\.?/)*e2e-helpers['\"]`).test(source)
}

const directButtonRules = [
  {
    label: 'この内容でインポート',
    helperName: 'importConfirmButton',
    helperCall: /importConfirmButton\(/,
    directLocator: /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]この内容でインポート['"]\s*\}\)/,
  },
  {
    label: 'インポートをキャンセル',
    helperName: 'importCancelButton',
    helperCall: /importCancelButton\(/,
    directLocator: /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]インポートをキャンセル['"]\s*\}\)/,
  },
]

function collectImportConfirmRaceOffenders(spec, source) {
  const riskyNextActions = [
    "request.get('/api/items'",
    'request.get("/api/items"',
    'page.reload(',
    'downloadJsonExport(',
    'page.waitForEvent(',
    'page.getByText(',
    'page.locator(',
    'searchSection.getBy',
  ]
  const offenders = []
  const confirmClickPattern = /await\s+importConfirmButton\(page\)\.click\(\)/g
  const matches = [...source.matchAll(confirmClickPattern)]

  for (const match of matches) {
    const start = match.index + match[0].length
    const nextMutationIndexes = [
      source.indexOf('importConfirmButton(page).click()', start),
      source.indexOf('registrationSaveButton(page).click()', start),
      source.indexOf('editSaveButton(page).click()', start),
    ].filter((index) => index !== -1)
    const end = nextMutationIndexes.length > 0 ? Math.min(...nextMutationIndexes) : undefined
    const block = source.slice(start, end)
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

function collectRawImportCancelClickOffenders(spec, source) {
  const offenders = []
  const cancelClickPattern = /await\s+importCancelButton\(page\)\.click\(\)/g

  for (const match of source.matchAll(cancelClickPattern)) {
    const line = source.slice(0, match.index).split('\n').length
    offenders.push(`${spec}:${line}: use cancelImportAndWaitForStatus(page, expectedStatus) instead of raw importCancelButton(page).click()`)
  }

  return offenders
}

test('[E2E-Helper][import-preview-actions] E2E specs use shared import preview action locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')

    for (const rule of directButtonRules) {
      if (rule.directLocator.test(source)) {
        offenders.push(`${relativePath(specUrl)}: direct ${rule.label} locator`)
      }
      if (rule.helperCall.test(source) && !importsHelper(source, rule.helperName)) {
        offenders.push(`${relativePath(specUrl)}: ${rule.helperName} call without named import`)
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importConfirmButton()/importCancelButton() so import preview action names stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-actions] helpers own import preview action accessible-name contracts', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importConfirmButton/, 'tests/e2e-helpers.ts should export importConfirmButton')
  assert.match(source, /export function importCancelButton/, 'tests/e2e-helpers.ts should export importCancelButton')
  assert.match(source, /export async function confirmImportAndWaitForStatus/, 'tests/e2e-helpers.ts should export confirmImportAndWaitForStatus')
  assert.match(source, /export async function cancelImportAndWaitForStatus/, 'tests/e2e-helpers.ts should export cancelImportAndWaitForStatus')
  assert.match(source, /name:\s*['"]この内容でインポート['"]/, 'importConfirmButton should own the confirm accessible name')
  assert.match(source, /name:\s*['"]インポートをキャンセル['"]/, 'importCancelButton should own the cancel accessible name')
  assert.match(source, /await importCancelButton\(page\)\.click\(\)[\s\S]*await expectOperationStatus\(page, text\)/, 'cancelImportAndWaitForStatus should click cancel and wait for the cancel live-region')
})

test('[E2E-Helper][import-preview-actions] risky post-import-confirm workflows wait for import completion', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const source = await readFile(new URL(spec, `${root}/`), 'utf8')
    offenders.push(...collectImportConfirmRaceOffenders(spec, source))
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs that confirm an import and then inspect UI/API/export state should wait for the import success live-region first: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-actions] import cancel workflows use completion helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const source = await readFile(new URL(spec, `${root}/`), 'utf8')
    offenders.push(...collectRawImportCancelClickOffenders(spec, source))
    if (source.includes('cancelImportAndWaitForStatus(') && !importsHelper(source, 'cancelImportAndWaitForStatus')) {
      offenders.push(`${spec}: cancelImportAndWaitForStatus call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs that cancel an import preview should wait through cancelImportAndWaitForStatus(page, expectedStatus): ${offenders.join(', ')}`,
  )
})
