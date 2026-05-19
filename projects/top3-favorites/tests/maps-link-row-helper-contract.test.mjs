import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

async function listMapsSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listMapsSpecs(childUrl)))
      continue
    }
    if (entry.isFile() && entry.name.startsWith('maps-link-') && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(childUrl)
    }
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*\\b${helperName}\\b[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][maps-link-row] Maps link specs use shared ranked item summary locator before opening details', async () => {
  const offenders = []
  const specs = await listMapsSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover Maps link E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directRankText = /getByText\(['"]\d位:\s*[^'"]+['"]\)/.test(source)
    const directSummaryLocator = /\.locator\(['"]summary['"],\s*\{\s*hasText:\s*\/?\d位:\\s\*/.test(source)
    const usesHelper = /rankedItemSummary\(/.test(source)

    if (directRankText) offenders.push(`${path}: direct ranked item text locator`)
    if (directSummaryLocator) offenders.push(`${path}: direct summary hasText rank locator`)
    if (usesHelper && !importsHelper(source, 'rankedItemSummary')) {
      offenders.push(`${path}: rankedItemSummary call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Maps link specs should open item details through rankedItemSummary(scope, rank, name): ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][maps-link-row] helper owns ranked item summary text format', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export function rankedItemSummary\(scope: Page \| Locator, rank: 1 \| 2 \| 3, itemName: string \| RegExp\): Locator/,
    'tests/e2e-helpers.ts should export rankedItemSummary(scope, rank, itemName)',
  )
  assert.match(source, /rankedItemSummary[\s\S]*locator\(['"]summary['"],[\s\S]*hasText/, 'rankedItemSummary should own summary + rank text matching')
})

test('[App][config-quality] full verification runs Maps link row helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(pkg.scripts['test:maps-link-row-helper-contract'], 'node --test tests/maps-link-row-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:maps-link-row-helper-contract/, 'pnpm test:full should include the Maps link row helper contract')
})
