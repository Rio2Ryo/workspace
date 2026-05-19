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
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsSummaryHelper(source) {
  return /import \{[^}]*importPreviewSummary[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][import-preview-summary] E2E specs use shared import preview summary locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const usesDirectSummary = /getByTestId\(['"]import-preview-summary['"]\)/.test(source)
    const usesSummaryHelper = /importPreviewSummary\(/.test(source)

    if (usesDirectSummary) {
      offenders.push(`${relativePath(specUrl)}: direct import preview summary locator`)
    }
    if (usesSummaryHelper && !importsSummaryHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: importPreviewSummary call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importPreviewSummary(page) so summary locator drift is centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-summary] helper owns summary test id and parser consumes it', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewSummary/, 'tests/e2e-helpers.ts should export importPreviewSummary(page)')
  assert.match(source, /importPreviewSummary[\s\S]*getByTestId\(['"]import-preview-summary['"]\)/, 'importPreviewSummary should own import-preview-summary')
  assert.match(source, /parseImportPreviewSummary[\s\S]*summaryLocator\.getAttribute\(['"]data-summary-json['"]\)/, 'parseImportPreviewSummary should continue to own data-summary-json parsing')
})

test('[App][config-quality] full verification runs import preview summary helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-summary-helper-contract/, 'pnpm test:full should include the import preview summary helper contract')
})
