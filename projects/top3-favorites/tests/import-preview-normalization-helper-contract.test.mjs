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

test('[E2E-Helper][import-preview-normalization] E2E specs use shared normalization/retry-hint locators', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const path = relativePath(specUrl)
    const directNormalization = /getByTestId\(['"]import-preview-normalization['"]\)/.test(source)
    const directReplaceHint = /getByTestId\(['"]import-preview-replace-hint['"]\)/.test(source)
    const usesNormalizationHelper = /importPreviewNormalization\(/.test(source)
    const usesReplaceHintHelper = /importPreviewReplaceHint\(/.test(source)

    if (directNormalization) offenders.push(`${path}: direct import preview normalization test id`)
    if (directReplaceHint) offenders.push(`${path}: direct import preview replace hint test id`)
    if (usesNormalizationHelper && !importsHelper(source, 'importPreviewNormalization')) {
      offenders.push(`${path}: importPreviewNormalization call without named import`)
    }
    if (usesReplaceHintHelper && !importsHelper(source, 'importPreviewReplaceHint')) {
      offenders.push(`${path}: importPreviewReplaceHint call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use importPreviewNormalization(page)/importPreviewReplaceHint(page) so localized preview copy/testid drift is centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-normalization] helpers own normalization and retry-hint test ids', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewNormalization/, 'tests/e2e-helpers.ts should export importPreviewNormalization(page)')
  assert.match(source, /importPreviewNormalization[\s\S]*getByTestId\(['"]import-preview-normalization['"]\)/, 'importPreviewNormalization should own the normalization test id')
  assert.match(source, /export function importPreviewReplaceHint/, 'tests/e2e-helpers.ts should export importPreviewReplaceHint(page)')
  assert.match(source, /importPreviewReplaceHint[\s\S]*getByTestId\(['"]import-preview-replace-hint['"]\)/, 'importPreviewReplaceHint should own the replace hint test id')
})

test('[App][config-quality] full verification runs import preview normalization helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-normalization-helper-contract/, 'pnpm test:full should include the import preview normalization helper contract')
})
