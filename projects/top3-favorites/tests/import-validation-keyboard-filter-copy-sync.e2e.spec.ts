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

test('keyboard field-filter changes immediately update import validation copy targets', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-keyboard-filter-copy-sync.json', invalidItems)

  const tagFilter = importValidationFieldFilter(page, 'tag')
  const nameFilter = importValidationFieldFilter(page, 'name')

  await tagFilter.focus()
  await page.keyboard.press('Enter')
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-keyboard-filter-copy-sync.json\n対象: tag 2件 / 全3件\n$.items[1].tag\n$.items[2].tag',
  )

  await nameFilter.focus()
  await page.keyboard.press(' ')
  await expect(importValidationFilteredRepairStatus(page, 'name', 1)).toBeVisible()
  await importValidationCopyRepairList(page).click()
  await expectOperationStatus(page, '修正対象一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-keyboard-filter-copy-sync.json\n対象: name 1件 / 全3件\n1件目 / $.items[0].name / name / 入力値: "" / 店舗名を入力してください。',
  )

  const clearFilter = importValidationFieldClear(page)
  await clearFilter.focus()
  await page.keyboard.press('Enter')
  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-keyboard-filter-copy-sync.json\n対象: 全3件\n$.items[0].name\n$.items[1].tag\n$.items[2].tag',
  )
})
