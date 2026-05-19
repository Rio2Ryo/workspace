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

function importsHelper(source, helperName) {
  return new RegExp(`import \\{[^}]*${helperName}[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][import-preview-live] E2E specs use shared live/no-change locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directLive = /getByTestId\(['"]import-preview-live['"]\)/.test(source)
    const directNoChange = /getByTestId\(['"]import-preview-no-change['"]\)/.test(source)
    const usesLiveHelper = /importPreviewLive\(/.test(source)
    const usesNoChangeHelper = /importPreviewNoChange\(/.test(source)

    if (directLive) offenders.push(`${path}: direct import preview live summary test id`)
    if (directNoChange) offenders.push(`${path}: direct import preview no-change test id`)
    if (usesLiveHelper && !importsHelper(source, 'importPreviewLive')) {
      offenders.push(`${path}: importPreviewLive call without named import`)
    }
    if (usesNoChangeHelper && !importsHelper(source, 'importPreviewNoChange')) {
      offenders.push(`${path}: importPreviewNoChange call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importPreviewLive(page)/importPreviewNoChange(page) so live-region and no-change badge locator drift is centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-live] helpers own live summary and no-change badge test ids', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewLive/, 'tests/e2e-helpers.ts should export importPreviewLive(page)')
  assert.match(source, /importPreviewLive[\s\S]*getByTestId\(['"]import-preview-live['"]\)/, 'importPreviewLive should own the live summary test id')
  assert.match(source, /export function importPreviewNoChange/, 'tests/e2e-helpers.ts should export importPreviewNoChange(page)')
  assert.match(source, /importPreviewNoChange[\s\S]*getByTestId\(['"]import-preview-no-change['"]\)/, 'importPreviewNoChange should own the no-change badge test id')
})

test('[App][config-quality] full verification runs import preview live helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-live-helper-contract/, 'pnpm test:full should include the import preview live helper contract')
})
