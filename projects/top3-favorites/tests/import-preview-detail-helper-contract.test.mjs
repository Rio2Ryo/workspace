import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const packagePath = new URL('package.json', `${root}/`)
const appPath = new URL('src/App.tsx', `${root}/`)

const helperNames = [
  'importPreviewDirectionMetrics',
  'importPreviewMetricAdded',
  'importPreviewMetricKept',
  'importPreviewMetricRemoved',
  'importPreviewImpactTags',
  'importPreviewToggleImpactTags',
  'importPreviewTermsHelper',
  'importPreviewToggleTermsHelper',
]

const forbiddenTestIds = [
  ['import-preview-direction-metrics', 'direction metrics locator'],
  ['import-preview-metric-added', 'added metric locator'],
  ['import-preview-metric-kept', 'kept metric locator'],
  ['import-preview-metric-removed', 'removed metric locator'],
  ['import-preview-impact-tags', 'impact tags locator'],
  ['import-preview-toggle-impact-tags', 'impact tags toggle locator'],
  ['import-preview-terms-helper', 'terms helper locator'],
  ['import-preview-toggle-terms-helper', 'terms helper toggle locator'],
]

const forbiddenButtonNames = [
  ['差分用語の詳細説明を表示', 'terms helper show button'],
  ['差分用語の詳細説明を隠す', 'terms helper hide button'],
  ['影響タグをすべて表示', 'impact tags show button'],
  ['影響タグを折りたたむ', 'impact tags hide button'],
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
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) specs.push(childUrl)
  }

  return specs.sort((a, b) => a.pathname.localeCompare(b.pathname))
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

function importsDetailHelpers(source) {
  return new RegExp(`import \\{[^}]*(?:${helperNames.join('|')})[^}]*\\} from '(?:\\.\\/|\\.\\.\\/)*e2e-helpers'`).test(source)
}

test('[E2E-Helper][import-preview-details] E2E specs use shared direction/tag/terms helpers', async () => {
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

    for (const [buttonName, label] of forbiddenButtonNames) {
      if (source.includes(`getByRole('button', { name: '${buttonName}' })`) || source.includes(`getByRole("button", { name: "${buttonName}" })`)) {
        offenders.push(`${relativePath(specUrl)}: direct import preview ${label}`)
      }
    }

    if (usedHelpers.length > 0 && !importsDetailHelpers(source)) {
      offenders.push(`${relativePath(specUrl)}: import preview detail helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use import preview detail helpers so direction/tag/terms locators and copy stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-preview-details] helpers own direction/tag/terms test ids', async () => {
  const source = await readFile(helperPath, 'utf8')

  for (const name of helperNames) {
    assert.match(source, new RegExp(`export function ${name}`), `tests/e2e-helpers.ts should export ${name}(page)`)
  }

  const expectations = [
    ['importPreviewDirectionMetrics', 'import-preview-direction-metrics'],
    ['importPreviewMetricAdded', 'import-preview-metric-added'],
    ['importPreviewMetricKept', 'import-preview-metric-kept'],
    ['importPreviewMetricRemoved', 'import-preview-metric-removed'],
    ['importPreviewImpactTags', 'import-preview-impact-tags'],
    ['importPreviewToggleImpactTags', 'import-preview-toggle-impact-tags'],
    ['importPreviewTermsHelper', 'import-preview-terms-helper'],
    ['importPreviewToggleTermsHelper', 'import-preview-toggle-terms-helper'],
  ]

  for (const [helper, testId] of expectations) {
    assert.match(source, new RegExp(`${helper}[\\s\\S]*getByTestId\\(['\"]${testId}['\"]\\)`), `${helper} should own ${testId}`)
  }
})

test('[App][import-preview-details] terms helper uses semantic term descriptions', async () => {
  const source = await readFile(appPath, 'utf8')
  const termsHelperMatch = source.match(/<dl[\s\S]*id="import-preview-terms-helper"[\s\S]*?<\/dl>/)

  assert.ok(termsHelperMatch, 'import preview terms helper should render as a dl, not punctuation-separated paragraph text')
  const termsHelperSource = termsHelperMatch[0]
  assert.match(termsHelperSource, /aria-label="差分用語の説明"/, 'terms helper dl should expose an accessible label')
  assert.match(termsHelperSource, /<dt>削除予定<\/dt>[\s\S]*<dd>現在DBにあるが、インポート後データに含まれない項目<\/dd>/, '削除予定 should be paired with its definition')
  assert.match(termsHelperSource, /<dt>正規化除外<\/dt>[\s\S]*<dd>インポートJSON内で同一タグTop3に収まらず取り込まれない項目<\/dd>/, '正規化除外 should be paired with its definition')
  assert.doesNotMatch(termsHelperSource, /\s\/\s/, 'terms helper should not separate definitions with a slash')
})

test('[App][config-quality] full verification runs import preview detail helper contract', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:full'], /test:import-preview-detail-helper-contract/, 'pnpm test:full should include the import preview detail helper contract')
})
