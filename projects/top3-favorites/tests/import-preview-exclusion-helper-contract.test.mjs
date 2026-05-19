import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)

const helperNames = [
  'importPreviewExcludedNames',
  'importPreviewExcludedDetails',
  'importPreviewExcludedNameVariants',
  'importPreviewToggleExcludedNames',
  'importPreviewToggleExcludedDetails',
  'expectImportPreviewExcludedNamesContract',
]

const forbiddenExcludedNameAttributes = [
  ['data-excluded-name-count', 'excluded name count attribute'],
  ['data-excluded-name-labels', 'excluded name labels attribute'],
  ['data-excluded-name-reason-labels', 'excluded name reason labels attribute'],
]

const forbiddenTestIds = [
  ['import-preview-excluded-names', 'excluded names locator'],
  ['import-preview-excluded-details', 'excluded details locator'],
  ['import-preview-excluded-name-variants', 'excluded name variants locator'],
  ['import-preview-toggle-excluded-names', 'excluded names toggle locator'],
  ['import-preview-toggle-excluded-details', 'excluded details toggle locator'],
]

const forbiddenButtonNames = [
  ['除外店舗名を全件表示', 'excluded names show button'],
  ['除外店舗名を折りたたむ', 'excluded names hide button'],
  ['除外理由を全件表示', 'excluded details show button'],
  ['除外理由を折りたたむ', 'excluded details hide button'],
]

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

function importsExclusionHelpers(source) {
  return new RegExp(`import \\{[^}]*(?:${helperNames.join('|')})[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

function directForbiddenButtonNames(source) {
  const offenders = []
  for (const [buttonName, label] of forbiddenButtonNames) {
    if (source.includes(`getByRole('button', { name: '${buttonName}' })`) || source.includes(`getByRole("button", { name: "${buttonName}" })`)) {
      offenders.push(label)
    }
  }
  return offenders
}

function directForbiddenExcludedNameAttributes(source) {
  const offenders = []
  for (const [attributeName, label] of forbiddenExcludedNameAttributes) {
    if (new RegExp(`toHaveAttribute\\(\\s*['\"]${attributeName}['\"]`).test(source)) {
      offenders.push(label)
    }
  }
  return offenders
}

test('[E2E-Helper][import-preview-exclusions] contract catches excluded-detail toggle copy', () => {
  assert.deepEqual(
    directForbiddenButtonNames("await page.getByRole('button', { name: '除外理由を全件表示' }).click()\nawait page.getByRole('button', { name: '除外理由を折りたたむ' }).click()"),
    ['excluded details show button', 'excluded details hide button'],
    'contract should catch direct excluded-detail toggle accessible names',
  )
})

test('[E2E-Helper][import-preview-exclusions] contract catches excluded-name toggle copy', () => {
  assert.deepEqual(
    directForbiddenButtonNames("await page.getByRole('button', { name: '除外店舗名を全件表示' }).click()\nawait page.getByRole('button', { name: '除外店舗名を折りたたむ' }).click()"),
    ['excluded names show button', 'excluded names hide button'],
    'contract should catch direct excluded-name toggle accessible names',
  )
})

test('[E2E-Helper][import-preview-exclusions] contract catches excluded-name data attribute copy', () => {
  const source = "await expect(names).toHaveAttribute('data-excluded-name-reason-labels', 'A（カフェでTop3外: 4位相当）')"
  assert.deepEqual(
    directForbiddenExcludedNameAttributes(source),
    ['excluded name reason labels attribute'],
    'contract should catch direct excluded-name reason-label attribute assertions',
  )
})

test('[E2E-Helper][import-preview-exclusions] E2E specs use shared excluded-name/detail helpers', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const usedHelpers = helperNames.filter((name) => new RegExp(`${name}\\(`).test(source))

    for (const [testId, label] of forbiddenTestIds) {
      if (new RegExp(`getByTestId\\(['\"]${testId}['\"]\\)`).test(source)) {
        offenders.push(`${relativePath(specUrl)}: direct import preview ${label}`)
      }
    }

    for (const label of directForbiddenButtonNames(source)) {
      offenders.push(`${relativePath(specUrl)}: direct import preview ${label}`)
    }

    for (const label of directForbiddenExcludedNameAttributes(source)) {
      offenders.push(`${relativePath(specUrl)}: direct import preview ${label}`)
    }

    if (usedHelpers.length > 0 && !importsExclusionHelpers(source)) {
      offenders.push(`${relativePath(specUrl)}: import preview exclusion helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use import preview exclusion helpers so excluded-name/detail test ids and copy stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-exclusions] helpers own excluded-name/detail test ids', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export function importPreviewExcludedNames/, 'tests/e2e-helpers.ts should export importPreviewExcludedNames(page)')
  assert.match(source, /importPreviewExcludedNames[\s\S]*getByTestId\(['"]import-preview-excluded-names['"]\)/, 'importPreviewExcludedNames should own the excluded names test id')
  assert.match(source, /export function importPreviewExcludedDetails/, 'tests/e2e-helpers.ts should export importPreviewExcludedDetails(page)')
  assert.match(source, /importPreviewExcludedDetails[\s\S]*getByTestId\(['"]import-preview-excluded-details['"]\)/, 'importPreviewExcludedDetails should own the excluded details test id')
  assert.match(source, /export function importPreviewExcludedNameVariants/, 'tests/e2e-helpers.ts should export importPreviewExcludedNameVariants(page)')
  assert.match(source, /importPreviewExcludedNameVariants[\s\S]*getByTestId\(['"]import-preview-excluded-name-variants['"]\)/, 'importPreviewExcludedNameVariants should own the excluded name variants test id')
  assert.match(source, /export function importPreviewToggleExcludedNames/, 'tests/e2e-helpers.ts should export importPreviewToggleExcludedNames(page)')
  assert.match(source, /importPreviewToggleExcludedNames[\s\S]*getByTestId\(['"]import-preview-toggle-excluded-names['"]\)/, 'importPreviewToggleExcludedNames should own the excluded names toggle test id')
  assert.match(source, /export function importPreviewToggleExcludedDetails/, 'tests/e2e-helpers.ts should export importPreviewToggleExcludedDetails(page)')
  assert.match(source, /importPreviewToggleExcludedDetails[\s\S]*getByTestId\(['"]import-preview-toggle-excluded-details['"]\)/, 'importPreviewToggleExcludedDetails should own the excluded details toggle test id')
  assert.match(source, /export async function expectImportPreviewExcludedNamesContract/, 'tests/e2e-helpers.ts should export expectImportPreviewExcludedNamesContract(page, contract)')
  assert.match(source, /expectImportPreviewExcludedNamesContract[\s\S]*data-excluded-name-count/, 'expectImportPreviewExcludedNamesContract should own excluded name count attribute assertions')
  assert.match(source, /expectImportPreviewExcludedNamesContract[\s\S]*data-excluded-name-labels/, 'expectImportPreviewExcludedNamesContract should own excluded name label attribute assertions')
  assert.match(source, /expectImportPreviewExcludedNamesContract[\s\S]*data-excluded-name-reason-labels/, 'expectImportPreviewExcludedNamesContract should own excluded name reason-label attribute assertions')
  assert.match(source, /expectImportPreviewExcludedNamesContract[\s\S]*parseImportPreviewSummary/, 'expectImportPreviewExcludedNamesContract should compare the visible DOM contract against summary JSON')
})

test('[App][config-quality] full verification runs import preview exclusion helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-exclusion-helper-contract/, 'pnpm test:full should include the import preview exclusion helper contract')
})
