import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
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
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(childUrl)
    }
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsImportPreviewMetricsHelpers(source) {
  return /import \{[^}]*(?:importPreviewCounts|expectImportPreviewCounts|importPreviewImpactMath|expectImportPreviewImpactMath)[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][import-preview-metrics] E2E specs use shared import preview metric helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const usesDirectCountsText = /getByText\(['"]現在\d+件 → インポート後\d+件['"]\)/.test(source)
    const usesDirectCountsTestId = /getByTestId\(['"]import-preview-counts['"]\)/.test(source)
    const usesDirectImpactText = /getByText\(['"]追加\d+件 \/ 更新・保持\d+件 \/ 削除予定\d+件 \/ 正規化除外\d+件['"]\)/.test(source)
    const usesDirectImpactTestId = /getByTestId\(['"]import-preview-impact-math['"]\)/.test(source)
    const usesHelper = /(?:importPreviewCounts|expectImportPreviewCounts|importPreviewImpactMath|expectImportPreviewImpactMath)\(/.test(source)

    if (usesDirectCountsText || usesDirectCountsTestId) {
      offenders.push(`${relativePath(specUrl)}: direct import preview counts locator`)
    }
    if (usesDirectImpactText || usesDirectImpactTestId) {
      offenders.push(`${relativePath(specUrl)}: direct import preview impact math locator`)
    }
    if (usesHelper && !importsImportPreviewMetricsHelpers(source)) {
      offenders.push(`${relativePath(specUrl)}: import preview metrics helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importPreviewCounts()/expectImportPreviewCounts() and importPreviewImpactMath()/expectImportPreviewImpactMath() so preview metric test ids and copy stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-metrics] helpers own preview metric locators and text formats', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewCounts/, 'tests/e2e-helpers.ts should export importPreviewCounts(page)')
  assert.match(source, /getByTestId\(['"]import-preview-counts['"]\)/, 'importPreviewCounts should own the counts test id')
  assert.match(source, /export async function expectImportPreviewCounts/, 'tests/e2e-helpers.ts should export expectImportPreviewCounts(page, before, after)')
  assert.match(source, /expectImportPreviewCounts[\s\S]*importPreviewCounts\(page\)[\s\S]*toHaveText\(`現在\$\{beforeCount\}件 → インポート後\$\{afterCount\}件`\)/, 'expectImportPreviewCounts should own the localized counts copy')
  assert.match(source, /export function importPreviewImpactMath/, 'tests/e2e-helpers.ts should export importPreviewImpactMath(page)')
  assert.match(source, /getByTestId\(['"]import-preview-impact-math['"]\)/, 'importPreviewImpactMath should own the impact math test id')
  assert.match(source, /export async function expectImportPreviewImpactMath/, 'tests/e2e-helpers.ts should export expectImportPreviewImpactMath(page, metrics)')
  assert.match(source, /expectImportPreviewImpactMath[\s\S]*importPreviewImpactMath\(page\)[\s\S]*toHaveText\(`追加\$\{added\}件 \/ 更新・保持\$\{kept\}件 \/ 削除予定\$\{removed\}件 \/ 正規化除外\$\{excluded\}件`\)/, 'expectImportPreviewImpactMath should own the localized impact math copy')
})

test('[App][config-quality] full verification runs import preview metrics helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-metrics-helper-contract/, 'pnpm test:full should include the import preview metrics helper contract')
})
