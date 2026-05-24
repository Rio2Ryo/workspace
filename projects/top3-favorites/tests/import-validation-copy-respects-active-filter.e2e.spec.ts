import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  importValidationCopyJsonPaths,
  importValidationCopyRepairList,
  importValidationFieldClear,
  importValidationFieldFilter,
  importValidationFilteredRepairStatus,
  installClipboardRecorder,
  readClipboardRecorder,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation copy actions always follow the currently active field filter', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-import-copy-filter-sync.json', invalidItems)

  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-import-copy-filter-sync.json\n対象: tag 2件 / 全3件\n$.items[1].tag\n$.items[2].tag',
  )

  await importValidationFieldFilter(page, 'name').click()
  await expect(importValidationFilteredRepairStatus(page, 'name', 1)).toBeVisible()
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-import-copy-filter-sync.json\n対象: name 1件 / 全3件\n1件目 / $.items[0].name / name / 入力値: "" / 店舗名を入力してください。',
  )

  await importValidationFieldClear(page).click()
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-import-copy-filter-sync.json\n対象: 全3件\n$.items[0].name\n$.items[1].tag\n$.items[2].tag',
  )
})
