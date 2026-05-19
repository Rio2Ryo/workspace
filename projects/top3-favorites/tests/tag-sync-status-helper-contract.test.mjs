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

function sourceImportsTagSyncStatusHelper(source) {
  return /^import\s*\{[^}]*tagSyncStatus[^}]*\}\s*from\s*['"](?:\.\/|\.\.\/)*e2e-helpers['"]/m.test(source)
}

function sourceUsesDirectTagSyncStatus(source) {
  return /getByTestId\(['"]tag-sync-status['"]\)/.test(source)
}

test('[E2E-Helper][tag-sync-status] E2E specs locate tag sync status through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesHelper = /tagSyncStatus\(/.test(source)
    const usesDirectStatus = sourceUsesDirectTagSyncStatus(source)

    if (usesDirectStatus) {
      offenders.push(`${relativePath(specUrl)}: direct tag-sync-status test id`)
    }
    if (usesHelper && !sourceImportsTagSyncStatusHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use tagSyncStatus(page) so the tag sync notice test id stays centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][tag-sync-status] helper owns tag sync status locator', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function tagSyncStatus\(page: Page\): Locator/, 'tests/e2e-helpers.ts should export tagSyncStatus(page)')
  assert.match(source, /page\.getByTestId\(['"]tag-sync-status['"]\)/, 'tagSyncStatus should own the tag-sync-status test id')
})

test('[E2E-Helper][tag-sync-status] full verification runs tag sync status helper contract', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', `${root}/`), 'utf8'))

  assert.equal(
    packageJson.scripts['test:tag-sync-status-helper-contract'],
    'node --test tests/tag-sync-status-helper-contract.test.mjs',
    'package.json should expose test:tag-sync-status-helper-contract',
  )
  assert.match(
    packageJson.scripts['test:full'],
    /pnpm test:tag-sync-status-helper-contract/,
    'test:full should run the tag sync status helper contract',
  )
})
