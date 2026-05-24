import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)

const helperNames = ['postItem', 'putItem', 'replaceItems']

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

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*\\b${helperName}\\b[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][api-items-mutation] E2E specs use shared mutation helpers for /api/items writes', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const directMutationMatches = [...source.matchAll(/\b(?:page\.)?request\.(post|put|delete)\(\s*['"]\/api\/items(?:\?[^'"]*)?['"]/g)]

    for (const match of directMutationMatches) {
      offenders.push(`${relativePath(specUrl)}: direct request.${match[1]}('/api/items') without shared status assertion helper`)
    }

    for (const helperName of helperNames) {
      const usesHelper = new RegExp(`\\b${helperName}\\s*(?:<|\\()`).test(source)
      if (usesHelper && !importsHelper(source, helperName)) {
        offenders.push(`${relativePath(specUrl)}: ${helperName} helper call without named import`)
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use postItem/putItem/replaceItems so /api/items writes assert expected status before parsing or continuing: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][api-items-mutation] helpers own /api/items writes and expected status assertions', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function retryLoopbackRequest/, 'tests/e2e-helpers.ts should centralize transient loopback request retries')
  assert.match(source, /retryLoopbackRequest[\s\S]*EADDRNOTAVAIL/, 'retry helper should specifically cover loopback ephemeral-port exhaustion')

  assert.match(source, /export async function postItem/, 'tests/e2e-helpers.ts should export postItem(request, data, options)')
  assert.match(source, /postItem[\s\S]*retryLoopbackRequest\([\s\S]*request\.post\(\s*['"]\/api\/items['"]/, 'postItem should own the raw create endpoint through the retry helper')
  assert.match(source, /postItem[\s\S]*expect\(response\.status\(\)[\s\S]*\)\.toBe\(expectedStatus\)/, 'postItem should assert the expected status')

  assert.match(source, /export async function putItem/, 'tests/e2e-helpers.ts should export putItem(request, data, options)')
  assert.match(source, /putItem[\s\S]*retryLoopbackRequest\([\s\S]*request\.put\(\s*['"]\/api\/items['"]/, 'putItem should own the raw edit endpoint through the retry helper')
  assert.match(source, /putItem[\s\S]*expect\(response\.status\(\)[\s\S]*\)\.toBe\(expectedStatus\)/, 'putItem should assert the expected status')

  assert.match(source, /export async function replaceItems/, 'tests/e2e-helpers.ts should export replaceItems(request, data, options)')
  assert.match(source, /replaceItems[\s\S]*retryLoopbackRequest\([\s\S]*request\.post\(\s*['"]\/api\/items\?mode=replace['"]/, 'replaceItems should own the raw replace endpoint through the retry helper')
  assert.match(source, /replaceItems[\s\S]*expect\(response\.status\(\)[\s\S]*\)\.toBe\(expectedStatus\)/, 'replaceItems should assert the expected status')
})

test('[E2E-Helper][api-items-mutation] package scripts include mutation helper contract in full verification', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(
    packageJson.scripts['test:api-items-mutation-helper-contract'],
    'node --test tests/api-items-mutation-helper-contract.test.mjs',
    'package.json should expose test:api-items-mutation-helper-contract',
  )
  assert.match(
    packageJson.scripts['test:full'],
    /pnpm test:api-items-mutation-helper-contract/,
    'pnpm test:full should run the API items mutation helper contract',
  )
})
