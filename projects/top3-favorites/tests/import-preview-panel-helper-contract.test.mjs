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

function importsPanelHelper(source) {
  return /import \{[^}]*importPreviewPanel[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

test('[E2E-Helper][import-preview-panel] E2E specs use shared import preview panel locator', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const directPanelPatterns = [
      /getByLabel\(['"]インポート確認['"]\)/,
      /locator\(['"]\[aria-label=(?:\\['"]|['"])インポート確認(?:\\['"]|['"])\]['"]\)/,
    ]
    const usesDirectPanel = directPanelPatterns.some((pattern) => pattern.test(source))
    const usesPanelHelper = /importPreviewPanel\(/.test(source)

    if (usesDirectPanel) {
      offenders.push(`${relativePath(specUrl)}: direct import preview panel label locator`)
    }
    if (usesPanelHelper && !importsPanelHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: importPreviewPanel call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importPreviewPanel(page) so panel label drift is centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-panel] helper owns the panel accessible label', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewPanel/, 'tests/e2e-helpers.ts should export importPreviewPanel(page)')
  assert.match(source, /importPreviewPanel[\s\S]*getByLabel\(['"]インポート確認['"]\)/, 'importPreviewPanel should own the インポート確認 label')
})

test('[App][config-quality] full verification runs import preview panel helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-panel-helper-contract/, 'pnpm test:full should include the import preview panel helper contract')
})
