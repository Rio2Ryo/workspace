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

function importsReloadPageAndWaitForSearchReady(source) {
  return /import \{[^}]*reloadPageAndWaitForSearchReady[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][page-reload] E2E specs use shared reload+ready helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesDirectPageReload = /\bpage\.reload\s*\(/.test(source)
    const usesHelper = /reloadPageAndWaitForSearchReady\(/.test(source)

    if (usesDirectPageReload) {
      offenders.push(`${relativePath(specUrl)}: direct page.reload() without shared ready wait`)
    }
    if (usesHelper && !importsReloadPageAndWaitForSearchReady(source)) {
      offenders.push(`${relativePath(specUrl)}: reloadPageAndWaitForSearchReady helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use reloadPageAndWaitForSearchReady(page) so reload assertions wait for the app/search UI to be ready: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][page-reload] helper owns page.reload and semantic ready wait', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function reloadPageAndWaitForSearchReady/, 'tests/e2e-helpers.ts should export reloadPageAndWaitForSearchReady(page)')
  assert.match(
    source,
    /reloadPageAndWaitForSearchReady[\s\S]*await page\.reload\s*\(/,
    'reloadPageAndWaitForSearchReady should own the raw page.reload() call',
  )
  assert.match(
    source,
    /reloadPageAndWaitForSearchReady[\s\S]*await expect\(searchSection\(page\)\)\.toBeVisible\(\)/,
    'reloadPageAndWaitForSearchReady should wait for the search section after reload before specs assert persisted UI state',
  )
})
