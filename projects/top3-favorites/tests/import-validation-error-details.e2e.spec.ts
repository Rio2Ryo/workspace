import { expect, test } from '@playwright/test'
import {
  expectOperationAlert,
  expectOperationStatus,
  installClipboardRecorder,
  readClipboardRecorder,
  importPreviewSummary,
  importValidationCopyJsonPaths,
  importValidationCopyRepairList,
  importValidationErrorDetails,
  importValidationFieldClear,
  importValidationFieldFilter,
  importValidationFieldSummary,
  importValidationFieldSummaryItems,
  importValidationFilteredRepairStatus,
  importValidationDetailTerms,
  importValidationDetailValues,
  importValidationRepairHeading,
  importValidationRepairItems,
  importValidationShowAllRepairs,
  importValidationCollapseRepairs,
  importValidationCollapsedRepairStatus,
  importValidationExpandedRepairStatus,
  importValidationAnyRepairStatus,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation error identifies the first invalid row and field for quick recovery', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'valid-1', tag: 'カフェラテ', location: '柏の葉', name: 'Valid Shop', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-2', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-3', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-details.json', invalidItems)

  await expectOperationAlert(page, 
    'インポート失敗: ファイル「invalid-import-field-details.json」の2件目 / フィールド: tag / 修正: タグを入力してください。既存データは保持しました。',
  )
  const details = importValidationErrorDetails(page)
  await expect(details).toBeVisible()
  await expect(details).toHaveAttribute('aria-label', 'インポートエラーの修正情報')
  await expect(importValidationDetailTerms(page)).toHaveText(['ファイル', '行', 'JSONパス', 'フィールド', '修正', '検出件数'])
  await expect(importValidationDetailValues(page)).toHaveText([
    'invalid-import-field-details.json',
    '2件目',
    '$.items[1].tag',
    'tag',
    'タグを入力してください。',
    '合計2件（ほか1件も修正してください）',
  ])
  await expect(importValidationRepairHeading(page)).toBeVisible()
  const fieldSummary = importValidationFieldSummary(page)
  await expect(fieldSummary).toBeVisible()
  await expect(importValidationFieldSummaryItems(page)).toHaveText(['tag: 1件', 'name: 1件'])
  await expect(importValidationRepairItems(page)).toHaveText([
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].name / name / 店舗名を入力してください。',
  ])
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe('$.items[1].tag\n$.items[2].name')
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    '2件目 / $.items[1].tag / tag / タグを入力してください。\n3件目 / $.items[2].name / name / 店舗名を入力してください。',
  )
  await expect(importPreviewSummary(page)).toHaveCount(0)
})

test('import validation field summary prioritizes repeated fields over first-seen order', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-priority.json', invalidItems)

  await expectOperationAlert(page,
    'インポート失敗: ファイル「invalid-import-field-priority.json」の1件目 / フィールド: name / 修正: 店舗名を入力してください。既存データは保持しました。',
  )
  await expect(importValidationFieldSummaryItems(page)).toHaveText(['tag: 2件', 'name: 1件'])
})

test('import validation repair list collapses long all-issue lists and can expand back', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = Array.from({ length: 8 }, (_, index) => ({
    id: `invalid-name-${index + 1}`,
    tag: 'カフェラテ',
    location: '柏の葉',
    name: '',
    rank: 1,
    memo: '',
    mapsUrl: '',
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }))

  await uploadJsonImportFile(page, 'invalid-import-long-repair-list.json', invalidItems)

  await expect(importValidationCollapsedRepairStatus(page, 5, 3)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveCount(5)
  await expect(importValidationRepairItems(page).last()).toHaveText(
    '5件目 / $.items[4].name / name / 店舗名を入力してください。',
  )
  await importValidationShowAllRepairs(page).click()
  await expect(importValidationExpandedRepairStatus(page, 8)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveCount(8)
  await expect(importValidationRepairItems(page).last()).toHaveText(
    '8件目 / $.items[7].name / name / 店舗名を入力してください。',
  )
  await importValidationCollapseRepairs(page).click()
  await expect(importValidationCollapsedRepairStatus(page, 5, 3)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveCount(5)
})

test('import validation field summary filters the repair list to the selected repeated field', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-field-filter.json', invalidItems)

  await expect(importValidationRepairItems(page)).toHaveText([
    '1件目 / $.items[0].name / name / 店舗名を入力してください。',
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].tag / tag / タグを入力してください。',
  ])
  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveText([
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].tag / tag / タグを入力してください。',
  ])
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe('$.items[1].tag\n$.items[2].tag')
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    '2件目 / $.items[1].tag / tag / タグを入力してください。\n3件目 / $.items[2].tag / tag / タグを入力してください。',
  )
  await importValidationFieldFilter(page, 'name').click()
  await expect(importValidationFilteredRepairStatus(page, 'name', 1)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveText([
    '1件目 / $.items[0].name / name / 店舗名を入力してください。',
  ])
  await importValidationFieldClear(page).click()
  await expect(importValidationAnyRepairStatus(page)).toHaveCount(0)
  await expect(importValidationRepairItems(page)).toHaveText([
    '1件目 / $.items[0].name / name / 店舗名を入力してください。',
    '2件目 / $.items[1].tag / tag / タグを入力してください。',
    '3件目 / $.items[2].tag / tag / タグを入力してください。',
  ])
})
