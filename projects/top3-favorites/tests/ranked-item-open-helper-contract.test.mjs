import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const testsRoot = new URL('tests/', `${root}/`)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(childUrl)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsRankedItemSummary(source) {
  return /import \{[\s\S]*\brankedItemSummary\b[\s\S]*\} from ['"](?:\.\.\/)*\.\/??e2e-helpers['"]/.test(source)
    || /import \{[\s\S]*\brankedItemSummary\b[\s\S]*\} from ['"](?:\.\.\/)+e2e-helpers['"]/.test(source)
}

test('[E2E-Helper][ranked-item-open] E2E specs open ranked rows through rankedItemSummary helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)
  const directRankTextClickPattern = /\.getByText\([^;\n]*位:[^;\n]*\)(?:\.first\(\))?\.click\(/g
  const directSummaryLocatorPattern = /\.locator\(['"]summary['"]/g

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const rankTextClicks = [...source.matchAll(directRankTextClickPattern)].length
    const summaryLocators = [...source.matchAll(directSummaryLocatorPattern)].length

    if (rankTextClicks > 0) offenders.push(`${path}: direct ranked text click(s): ${rankTextClicks}`)
    if (summaryLocators > 0) offenders.push(`${path}: direct summary locator(s): ${summaryLocators}`)
    if (/rankedItemSummary\(/.test(source) && !importsRankedItemSummary(source)) {
      offenders.push(`${path}: rankedItemSummary call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Open ranked rows through rankedItemSummary(scope, rank, itemName) so summary/text contracts do not drift: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][ranked-item-open] helper owns the details summary locator contract', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(
    source,
    /export function rankedItemSummary\(scope: Page \| Locator, rank: 1 \| 2 \| 3, itemName: string \| RegExp\): Locator/,
    'tests/e2e-helpers.ts should export rankedItemSummary(scope, rank, itemName)',
  )
  assert.match(source, /rankedItemSummary[\s\S]*locator\(['"]summary['"],[\s\S]*hasText:[\s\S]*new RegExp/, 'rankedItemSummary should own the summary locator + rank/name text contract')
})

test('[App][config-quality] full verification runs ranked item open helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))

  assert.equal(pkg.scripts['test:ranked-item-open-helper-contract'], 'node --test tests/ranked-item-open-helper-contract.test.mjs')
  assert.match(pkg.scripts['test:full'], /pnpm test:ranked-item-open-helper-contract/, 'pnpm test:full should include the ranked item open helper contract')
})
