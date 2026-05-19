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

function sourceImportsDeleteCompletionHelper(source) {
  return /import \{[^}]*deleteItemAndWaitForStatus[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectItemDeleteButton(source) {
  return /getByRole\(['"]button['"],\s*\{\s*name:\s*(?:`[^`]*を削除`|['"][^#'"][^'"]*を削除['"]|['"]削除['"]|\/[^/]*削除[^/]*\/)\s*\}\)/.test(source)
}

function collectRawSuccessfulDeleteClickOffenders(spec, source) {
  const offenders = []
  const rawSuccessPattern = /const\s+\w+\s*=\s*acceptNextDeleteDialog\(page,[\s\S]{0,240}?await\s+itemDeleteButton\([^\n]+?\)\.click\(\)[\s\S]{0,240}?await\s+\w+\s*\n\s*await\s+expectOperationStatus\(page,\s*['"]削除しました。['"]\)/g

  for (const match of source.matchAll(rawSuccessPattern)) {
    const line = source.slice(0, match.index).split('\n').length
    offenders.push(`${spec}:${line}: use deleteItemAndWaitForStatus(...) for accepted successful delete flows`)
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

test('[E2E-Helper][item-delete-action] helper owns accepted delete click, dialog, and status wait', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export async function deleteItemAndWaitForStatus\(\s*page: Page,\s*scope: Page \| Locator,\s*itemName: string \| RegExp,\s*expectedDialogMessage: string \| RegExp,\s*expectedStatus: string \| RegExp,?\s*\): Promise<void> \{[\s\S]*?const dialogPromise = acceptNextDeleteDialog\(page, expectedDialogMessage\)[\s\S]*?await itemDeleteButton\(scope, itemName\)\.click\(\)[\s\S]*?await dialogPromise[\s\S]*?await expectOperationStatus\(page, expectedStatus\)[\s\S]*?\}/,
    'tests/e2e-helpers.ts should expose deleteItemAndWaitForStatus(page, scope, itemName, expectedDialogMessage, expectedStatus) that owns accepted delete + dialog + status wait',
  )
})

test('[E2E-Helper][item-delete-action] successful accepted delete workflows use completion helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    offenders.push(...collectRawSuccessfulDeleteClickOffenders(spec, source))
    if (/deleteItemAndWaitForStatus\(/.test(source) && !sourceImportsDeleteCompletionHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: deleteItemAndWaitForStatus helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Successful accepted delete E2E flows should use the shared completion helper: ${offenders.join(', ')}`,
  )
})
