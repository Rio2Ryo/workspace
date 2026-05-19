import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('..', import.meta.url)
const helperPath = new URL('tests/e2e-helpers.ts', `${root}/`)
const appPath = new URL('src/App.tsx', `${root}/`)
const testsRoot = new URL('tests/', `${root}/`)
const importPreviewRoot = new URL('tests/import-preview/', `${root}/`)

const validationSpecs = [
  'tests/import-fail-closed-matrix.e2e.spec.ts',
  'tests/import-validation-error-details.e2e.spec.ts',
  'tests/import-validation-trimmed-fields.e2e.spec.ts',
]

const summaryPreviewSpecs = [
  'tests/import-preview/summary/import-preview-excluded-names-collapsed.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-excluded-names-normalized-context.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-excluded-names-tag-context.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-expand-toggles-a11y.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-math-consistency.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-operation-guards-matrix.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-summary.e2e.spec.ts',
  'tests/import-preview/summary/import-preview-zero-metrics-muted.e2e.spec.ts',
]

async function listE2eSpecs(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const specs = []

  for (const entry of entries) {
    const childUrl = new URL(entry.name, dirUrl)
    if (entry.isDirectory()) {
      specs.push(...(await listE2eSpecs(new URL(`${entry.name}/`, dirUrl))))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.e2e.spec.ts')) {
      specs.push(relativePath(childUrl))
    }
  }

  return specs.sort()
}

function sourceImportsUploadHelper(source) {
  return /import \{[^}]*uploadJsonImportFile[^}]*\} from '(?:\.\/|\.\.\/)*e2e-helpers'/.test(source)
}

function sourceUsesDirectJsonUpload(source) {
  return /locator\('input\[type="file"\]\[accept\*="json"\]'\)|\.setInputFiles\(/.test(source)
}

function relativePath(url) {
  return url.pathname.replace(root.pathname, '').replace(/^\/+/, '')
}

test('[E2E-Helper][import-file] validation specs upload JSON through shared helper', async () => {
  const offenders = []

  for (const spec of validationSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!source.includes("from './e2e-helpers'") || !/uploadJsonImportFile\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (sourceUsesDirectJsonUpload(source)) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import validation specs should use uploadJsonImportFile() so file input selector, mime type, and JSON/string buffer creation stay centralized: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] import preview summary specs upload JSON through shared helper', async () => {
  const offenders = []

  for (const spec of summaryPreviewSpecs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    if (!sourceImportsUploadHelper(source) || !/uploadJsonImportFile\(/.test(source)) {
      offenders.push(relativePath(specUrl))
    }
    if (sourceUsesDirectJsonUpload(source)) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview summary specs should use uploadJsonImportFile() so import-preview UX contracts share the same file upload mechanics: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] all import preview specs upload JSON through shared helper', async () => {
  const offenders = []
  const specs = await listE2eSpecs(importPreviewRoot)

  assert.ok(specs.length > 0, 'contract should discover import-preview E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesUploadHelper = /uploadJsonImportFile\(/.test(source)
    const usesDirectUpload = sourceUsesDirectJsonUpload(source)

    if (usesDirectUpload) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
    if (usesUploadHelper && !sourceImportsUploadHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `import preview specs should share uploadJsonImportFile() for JSON import setup across categories: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] all E2E specs share JSON import upload mechanics', async () => {
  const offenders = []
  const specs = await listE2eSpecs(testsRoot)

  assert.ok(specs.length > 0, 'contract should discover E2E specs')

  for (const spec of specs) {
    const specUrl = new URL(spec, `${root}/`)
    const source = await readFile(specUrl, 'utf8')
    const usesUploadHelper = /uploadJsonImportFile\(/.test(source)
    const usesDirectUpload = sourceUsesDirectJsonUpload(source)

    if (usesDirectUpload) {
      offenders.push(`${relativePath(specUrl)}: direct file input upload`)
    }
    if (usesUploadHelper && !sourceImportsUploadHelper(source)) {
      offenders.push(`${relativePath(specUrl)}: helper call without named import`)
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `E2E specs should use uploadJsonImportFile() for JSON import setup instead of duplicating selectors, MIME type, and buffers: ${offenders.join(', ')}`,
  )
})

test('[E2E-Helper][import-file] import validation errors expose structured repair details', async () => {
  const appSource = await readFile(appPath, 'utf8')
  const validationSpec = await readFile(new URL('tests/import-validation-error-details.e2e.spec.ts', `${root}/`), 'utf8')

  assert.match(appSource, /type ImportValidationIssue = \{[\s\S]*filename: string[\s\S]*row: string[\s\S]*path: string[\s\S]*field: string[\s\S]*fix: string[\s\S]*message: string[\s\S]*totalIssues: number[\s\S]*relatedIssues: Array<Pick<ImportValidationIssue, 'row' \| 'path' \| 'field' \| 'fix'>>[\s\S]*\}/, 'App should keep structured import validation issue data instead of only a joined error sentence')
  assert.match(appSource, /data-testid="import-validation-error-details"/, 'App should render a dedicated validation repair details block')
  assert.match(appSource, /<dl>[\s\S]*<dt>ファイル<\/dt>[\s\S]*<dt>行<\/dt>[\s\S]*<dt>JSONパス<\/dt>[\s\S]*<dt>フィールド<\/dt>[\s\S]*<dt>修正<\/dt>[\s\S]*<dt>検出件数<\/dt>/, 'App should keep file, row, JSON path, field, fix, and total issue count as separate term labels')
  assert.match(appSource, /\$\.items\[\$\{index\}\]\.\$\{field\}/, 'App should expose JSON paths for field-level import validation issues')
  assert.match(appSource, /検出した修正対象[\s\S]*displayedImportValidationIssues\.map/, 'App should show the detected validation issues for multi-error recovery using the displayed repair list')
  assert.match(appSource, /importValidationFieldCounts[\s\S]*reduce<Map<string, number>>[\s\S]*\.sort\(\(left, right\) => right\.count - left\.count\)[\s\S]*data-testid="import-validation-field-summary"[\s\S]*フィールド別内訳/, 'App should summarize multi-error validation issues by field and prioritize repeated fields before first-seen order')
  assert.match(appSource, /selectedImportValidationField[\s\S]*visibleImportValidationIssues[\s\S]*filter\(\(issue\) => issue\.field === selectedImportValidationField\)[\s\S]*aria-pressed=\{selectedImportValidationField === field\}[\s\S]*\{field\}の修正対象だけ表示[\s\S]*すべての修正対象を表示/, 'App should let users filter the repair list from the field summary and explicitly return to the full list')
  assert.match(appSource, /copyImportValidationPaths[\s\S]*visibleImportValidationIssues\.map\(\(issue\) => issue\.path\)[\s\S]*navigator\.clipboard\.writeText\(paths\)[\s\S]*JSONパス一覧をコピーしました。/, 'App should let users copy the visible JSON paths after field filtering')
  assert.match(appSource, /copyImportValidationRepairs[\s\S]*visibleImportValidationIssues[\s\S]*issue\.row[\s\S]*issue\.path[\s\S]*issue\.field[\s\S]*issue\.fix[\s\S]*修正対象一覧をコピーしました。/, 'App should let users copy the visible repair checklist after field filtering')
  assert.match(appSource, /shouldCollapseImportValidationRepairList[\s\S]*displayedImportValidationIssues[\s\S]*slice\(0, importValidationRepairListLimit\)/, 'App should collapse the displayed validation repair list to the first issues by default')
  assert.match(appSource, /shouldToggleImportValidationRepairList = !selectedImportValidationField && visibleImportValidationIssues\.length > importValidationRepairListLimit/, 'App should only show repair-list expand/collapse controls for unfiltered long lists')
  assert.match(appSource, /表示中: 先頭/, 'App should label collapsed long validation repair-list state')
  assert.match(appSource, /表示中: 全/, 'App should label expanded long validation repair-list state')
  assert.match(appSource, /修正対象を全件表示[\s\S]*修正対象を折りたたむ|修正対象を折りたたむ[\s\S]*修正対象を全件表示/, 'App should label validation repair-list expand and collapse actions')
  const helperSource = await readFile(helperPath, 'utf8')
  assert.match(helperSource, /export function importValidationErrorDetails/, 'tests/e2e-helpers.ts should export importValidationErrorDetails(page)')
  assert.match(helperSource, /getByTestId\('import-validation-error-details'\)/, 'importValidationErrorDetails helper should own the validation details test id')
  assert.match(helperSource, /export function importValidationCopyJsonPaths/, 'tests/e2e-helpers.ts should export importValidationCopyJsonPaths(page)')
  assert.match(helperSource, /importValidationCopyJsonPaths[\s\S]*getByRole\('button', \{ name: 'JSONパス一覧をコピー' \}\)/, 'importValidationCopyJsonPaths helper should own the JSON path copy accessible name')
  assert.match(helperSource, /export function importValidationCopyRepairList/, 'tests/e2e-helpers.ts should export importValidationCopyRepairList(page)')
  assert.match(helperSource, /importValidationCopyRepairList[\s\S]*getByRole\('button', \{ name: '修正対象一覧をコピー' \}\)/, 'importValidationCopyRepairList helper should own the repair-list copy accessible name')
  assert.match(helperSource, /export function importValidationFieldSummary/, 'tests/e2e-helpers.ts should export importValidationFieldSummary(page)')
  assert.match(helperSource, /importValidationFieldSummary[\s\S]*getByTestId\('import-validation-field-summary'\)/, 'importValidationFieldSummary helper should own the field summary test id')
  assert.match(helperSource, /export function importValidationFieldFilter/, 'tests/e2e-helpers.ts should export importValidationFieldFilter(page, field)')
  assert.match(helperSource, /importValidationFieldFilter[\s\S]*importValidationFieldSummary\(page\)\.getByRole\('button', \{ name: `\$\{field\}の修正対象だけ表示` \}\)/, 'importValidationFieldFilter helper should own field-filter accessible names')
  assert.match(helperSource, /export function importValidationFieldClear/, 'tests/e2e-helpers.ts should export importValidationFieldClear(page)')
  assert.match(helperSource, /importValidationFieldClear[\s\S]*importValidationErrorDetails\(page\)\.getByRole\('button', \{ name: 'すべての修正対象を表示' \}\)/, 'importValidationFieldClear helper should own the full-list restore accessible name')
  assert.match(helperSource, /export function importValidationShowAllRepairs/, 'tests/e2e-helpers.ts should export importValidationShowAllRepairs(page)')
  assert.match(helperSource, /importValidationShowAllRepairs[\s\S]*importValidationErrorDetails\(page\)\.getByRole\('button', \{ name: '修正対象を全件表示' \}\)/, 'importValidationShowAllRepairs helper should own the repair-list expand accessible name')
  assert.match(helperSource, /export function importValidationCollapseRepairs/, 'tests/e2e-helpers.ts should export importValidationCollapseRepairs(page)')
  assert.match(helperSource, /importValidationCollapseRepairs[\s\S]*importValidationErrorDetails\(page\)\.getByRole\('button', \{ name: '修正対象を折りたたむ' \}\)/, 'importValidationCollapseRepairs helper should own the repair-list collapse accessible name')
  assert.match(helperSource, /export function importValidationDetailTerms/, 'tests/e2e-helpers.ts should export importValidationDetailTerms(page)')
  assert.match(helperSource, /importValidationDetailTerms[\s\S]*importValidationErrorDetails\(page\)\.locator\('dt'\)/, 'importValidationDetailTerms helper should own the detail term selector')
  assert.match(helperSource, /export function importValidationDetailValues/, 'tests/e2e-helpers.ts should export importValidationDetailValues(page)')
  assert.match(helperSource, /importValidationDetailValues[\s\S]*importValidationErrorDetails\(page\)\.locator\('dd'\)/, 'importValidationDetailValues helper should own the detail value selector')
  assert.match(helperSource, /export function importValidationRepairHeading/, 'tests/e2e-helpers.ts should export importValidationRepairHeading(page)')
  assert.match(helperSource, /importValidationRepairHeading[\s\S]*importValidationErrorDetails\(page\)\.getByText\('検出した修正対象'\)/, 'importValidationRepairHeading helper should own the repair-list heading copy')
  assert.match(helperSource, /export function importValidationRepairItems/, 'tests/e2e-helpers.ts should export importValidationRepairItems(page)')
  assert.match(helperSource, /importValidationRepairItems[\s\S]*importValidationErrorDetails\(page\)\.locator\('\.import-validation-error-list ol li'\)/, 'importValidationRepairItems helper should own the repair-list item selector')
  assert.match(helperSource, /export function importValidationCollapsedRepairStatus/, 'tests/e2e-helpers.ts should export importValidationCollapsedRepairStatus(page, visibleCount, remainingCount)')
  assert.match(helperSource, /表示中: 先頭\$\{visibleCount\}件（ほか\$\{remainingCount\}件）/, 'importValidationCollapsedRepairStatus helper should own the collapsed status copy')
  assert.match(helperSource, /export function importValidationExpandedRepairStatus/, 'tests/e2e-helpers.ts should export importValidationExpandedRepairStatus(page, totalCount)')
  assert.match(helperSource, /表示中: 全\$\{totalCount\}件/, 'importValidationExpandedRepairStatus helper should own the expanded status copy')
  assert.match(helperSource, /export function importValidationFilteredRepairStatus/, 'tests/e2e-helpers.ts should export importValidationFilteredRepairStatus(page, field, count)')
  assert.match(helperSource, /表示中: \$\{field\} の修正対象\$\{count\}件/, 'importValidationFilteredRepairStatus helper should own the field-filter status copy')
  assert.match(helperSource, /export function importValidationAnyRepairStatus/, 'tests/e2e-helpers.ts should export importValidationAnyRepairStatus(page)')
  assert.match(helperSource, /importValidationAnyRepairStatus[\s\S]*getByText\(\/\^表示中:\/\)/, 'importValidationAnyRepairStatus helper should own the display-status prefix lookup')
  assert.match(validationSpec, /importValidationErrorDetails\(page\)/, 'E2E should verify the structured import validation details block through the shared helper')
  assert.match(validationSpec, /importValidationCopyJsonPaths\(page\)/, 'E2E should click the JSON path copy action through the shared helper')
  assert.match(validationSpec, /importValidationCopyRepairList\(page\)/, 'E2E should click the repair-list copy action through the shared helper')
  assert.match(validationSpec, /importValidationFieldSummary\(page\)/, 'E2E should verify the field summary through the shared helper')
  assert.match(validationSpec, /importValidationFieldFilter\(page, 'tag'\)/, 'E2E should exercise field summary filtering through the shared helper')
  assert.match(validationSpec, /importValidationFieldClear\(page\)/, 'E2E should exercise full-list restore through the shared helper')
  assert.match(validationSpec, /importValidationShowAllRepairs\(page\)/, 'E2E should exercise long repair-list expansion through the shared helper')
  assert.match(validationSpec, /importValidationCollapseRepairs\(page\)/, 'E2E should exercise long repair-list collapse through the shared helper')
  assert.match(validationSpec, /importValidationRepairItems\(page\)/, 'E2E should verify repair-list items through the shared helper')
  assert.match(validationSpec, /importValidationCollapsedRepairStatus\(page, 5, 3\)/, 'E2E should verify collapsed repair-list status through the shared helper')
  assert.match(validationSpec, /importValidationExpandedRepairStatus\(page, 8\)/, 'E2E should verify expanded repair-list status through the shared helper')
  assert.match(validationSpec, /importValidationFilteredRepairStatus\(page, 'tag', 2\)/, 'E2E should verify field-filter repair status through the shared helper')
  assert.match(validationSpec, /importValidationAnyRepairStatus\(page\)/, 'E2E should verify full-list restore removes status through the shared helper')
  assert.match(validationSpec, /importValidationDetailTerms\(page\)/, 'E2E should verify detail terms through the shared helper')
  assert.match(validationSpec, /importValidationDetailValues\(page\)/, 'E2E should verify detail values through the shared helper')
  assert.match(validationSpec, /importValidationRepairHeading\(page\)/, 'E2E should verify the repair heading through the shared helper')
  assert.doesNotMatch(validationSpec, /getByTestId\('import-validation-error-details'\)/, 'E2E specs should not duplicate the import validation details test id')
  assert.doesNotMatch(validationSpec, /getByRole\('button', \{ name: '(?:JSONパス一覧をコピー|修正対象一覧をコピー|[^']+の修正対象だけ表示)' \}\)/, 'E2E specs should not duplicate import validation button accessible names')
  assert.doesNotMatch(validationSpec, /locator\('\.import-validation-error-list ol li'\)/, 'E2E specs should not duplicate the import validation repair-list item selector')
  assert.doesNotMatch(validationSpec, /getByText\((?:'表示中:|\/\^表示中:)/, 'E2E specs should not duplicate import validation repair-list display status copy')
  assert.doesNotMatch(validationSpec, /\.locator\('d[td]'\)|\.getByText\('検出した修正対象'\)/, 'E2E specs should not duplicate import validation detail-list selectors or repair heading copy')
  assert.match(validationSpec, /importValidationDetailTerms\(page\)\)\.toHaveText\(\['ファイル', '行', 'JSONパス', 'フィールド', '修正', '検出件数'\]\)/, 'E2E should verify the term labels including JSON path and total issue count, not just the joined alert text')
})

test('[E2E-Helper][import-file] uploadJsonImportFile helper owns selector/mime/buffer mechanics', async () => {
  const source = await readFile(helperPath, 'utf8')

  assert.match(source, /export async function uploadJsonImportFile/, 'tests/e2e-helpers.ts should export uploadJsonImportFile')
  assert.match(source, /input\[type="file"\]\[accept\*="json"\]/, 'helper should own the JSON file input selector')
  assert.match(source, /mimeType: 'application\/json'/, 'helper should own the import JSON mime type')
  assert.match(source, /typeof body === 'string' \? body : JSON\.stringify\(body\)/, 'helper should support both raw invalid JSON strings and serializable JSON bodies')
  assert.match(source, /Buffer\.from\([^\n]*'utf-8'\)/, 'helper should create the UTF-8 upload buffer')
})
