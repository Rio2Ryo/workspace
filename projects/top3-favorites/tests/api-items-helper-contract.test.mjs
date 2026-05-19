import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)
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

function importsFetchItems(source) {
  return /import \{[^}]*fetchItems[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][api-items] E2E specs use shared /api/items fetch helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesDirectItemsGet = /\b(?:page\.)?request\.get\(\s*['"]\/api\/items(?:\?[^'"]*)?['"]/.test(source)
    const usesHelper = /\bfetchItems\s*</.test(source) || /\bfetchItems\s*\(/.test(source)

    if (usesDirectItemsGet) {
      offenders.push(`${relativePath(specUrl)}: direct request.get('/api/items') without shared response.ok() assertion`)
    }
    if (usesHelper && !importsFetchItems(source)) {
      offenders.push(`${relativePath(specUrl)}: fetchItems helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use fetchItems<T>(request) so /api/items reads assert response.ok() before parsing JSON: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][api-items] helper owns /api/items GET and ok assertion', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function fetchItems/, 'tests/e2e-helpers.ts should export fetchItems(request)')
  assert.match(
    source,
    /fetchItems[\s\S]*await request\.get\(\s*['"]\/api\/items['"]\s*\)/,
    'fetchItems should own the raw /api/items GET endpoint',
  )
  assert.match(
    source,
    /fetchItems[\s\S]*expect\(response\.ok\(\)[\s\S]*\)\.toBe\(true\)/,
    'fetchItems should assert response.ok() before parsing JSON',
  )
  assert.match(
    source,
    /fetchItems[\s\S]*await response\.json\(\)/,
    'fetchItems should parse and return the API JSON response',
  )
})

test('[E2E-Helper][api-items] package scripts include helper contract in full verification', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(
    packageJson.scripts['test:api-items-helper-contract'],
    'node --test tests/api-items-helper-contract.test.mjs',
    'package.json should expose test:api-items-helper-contract',
  )
  assert.match(
    packageJson.scripts['test:full'],
    /pnpm test:api-items-helper-contract/,
    'pnpm test:full should run the API items helper contract',
  )
})
