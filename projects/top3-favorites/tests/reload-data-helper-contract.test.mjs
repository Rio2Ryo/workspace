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
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(childUrl))
    }
  }

  return specs.sort()
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsReloadDataButtonHelper(source) {
  return /import \{[^}]*reloadDataButton[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function importsReloadDataCompletionHelper(source) {
  return /import \{[^}]*reloadDataAndWaitForStatus[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][reload-data] E2E specs use shared reload-data button helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesDirectReloadButton = /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]データを再読み込み['"]\s*\}\)/.test(source)
    const usesHelper = /reloadDataButton\(/.test(source)

    if (usesDirectReloadButton) {
      offenders.push(`${relativePath(specUrl)}: direct reload-data button locator`)
    }
    if (usesHelper && !importsReloadDataButtonHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: reloadDataButton helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use reloadDataButton(page) so retry-button copy stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][reload-data] helper owns reload-data button accessible name', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function reloadDataButton/, 'tests/e2e-helpers.ts should export reloadDataButton(page)')
  assert.match(
    source,
    /reloadDataButton[\s\S]*getByRole\(['"]button['"],\s*\{\s*name:\s*['"]データを再読み込み['"]\s*\}\)/,
    'reloadDataButton should own the retry button role/name locator',
  )
})

test('[E2E-Helper][reload-data] helper owns retry click and completion status wait', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export async function reloadDataAndWaitForStatus\(\s*page: Page,\s*text: string \| RegExp\s*\): Promise<void> \{[\s\S]*?await reloadDataButton\(page\)\.click\(\)[\s\S]*?await expectOperationStatus\(page, text\)[\s\S]*?\}/,
    'tests/e2e-helpers.ts should expose reloadDataAndWaitForStatus(page, text) that owns retry click + operation status wait',
  )
})

test('[E2E-Helper][reload-data] retry workflows use completion helper before recovery assertions', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesRawRetryClick = /await\s+reloadDataButton\(page\)\.click\(\)/.test(source)
    const usesCompletionHelper = /reloadDataAndWaitForStatus\(/.test(source)

    if (usesRawRetryClick) {
      offenders.push(`${relativePath(specUrl)}: use reloadDataAndWaitForStatus(page, expectedStatus) instead of raw reloadDataButton(page).click()`)
    }
    if (usesCompletionHelper && !importsReloadDataCompletionHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: reloadDataAndWaitForStatus helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Retry recovery E2E should wait for the reload completion live-region through the shared helper: ${offenders.join(', ')}`,
  )
})
