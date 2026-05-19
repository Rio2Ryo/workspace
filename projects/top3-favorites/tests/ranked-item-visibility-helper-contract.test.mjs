import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const testsRoot = new URL('tests/', root)

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) {
      files.push(...await listE2eSpecs(entryUrl))
      continue
    }
    if (entry.name.endsWith('.e2e.spec.ts')) files.push(entryUrl)
  }
  return files
}

function rel(fileUrl) {
  return fileUrl.pathname.replace(root.pathname, '')
}

test('[E2E-Helper][ranked-item-visibility] E2E specs assert ranked rows through ranked item helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)
  const directRankTextPattern = /\.getByText\([^;\n]*(?:\\d|[123])位:[^;\n]*\)/g
  const directRankCountPattern = /\.getByText\([^;\n]*位:\/?[^;\n]*\)\.toHaveCount\(/g

  for (const specUrl of specs) {
    const text = await readFile(specUrl, 'utf8')
    const withoutAllowedHelperOpeners = text.replace(/rankedItemSummary\([^\n;]*\)/g, '')
    const directRankTextMatches = withoutAllowedHelperOpeners.match(directRankTextPattern) ?? []
    const directRankCountMatches = withoutAllowedHelperOpeners.match(directRankCountPattern) ?? []
    if (directRankTextMatches.length > 0 || directRankCountMatches.length > 0) {
      offenders.push(`${rel(specUrl)}: direct ranked text locator(s): ${directRankTextMatches.length + directRankCountMatches.length}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Assert ranked rows through rankedItemSummary(scope, rank, itemName), rankedItemSummaryByName(scope, itemName), or rankedItemSummaries(scope) so visible-row checks do not drift with localized summary copy: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][ranked-item-visibility] helpers own ranked summary visibility contracts', async () => {
  const helper = await readFile(new URL('tests/e2e-helpers.ts', root), 'utf8')
  assert.match(helper, /export function rankedItemSummary\(scope: Page \| Locator, rank: 1 \| 2 \| 3, itemName: string \| RegExp\): Locator \{[\s\S]*?locator\('summary'/)
  assert.match(helper, /export function rankedItemSummaryByName\(scope: Page \| Locator, itemName: string \| RegExp\): Locator \{[\s\S]*?locator\('summary'/)
  assert.match(helper, /export function rankedItemSummaries\(scope: Page \| Locator\): Locator \{[\s\S]*?locator\('summary'/)
})

test('[App][config-quality] full verification runs ranked item visibility helper contract', async () => {
  const packageJson = await readFile(new URL('package.json', root), 'utf8')
  assert.match(packageJson, /"test:ranked-item-visibility-helper-contract"\s*:\s*"node --test tests\/ranked-item-visibility-helper-contract\.test\.mjs"/)
  assert.match(packageJson, /pnpm test:ranked-item-visibility-helper-contract/)
})
