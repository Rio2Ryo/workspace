import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  importValidationCopyJsonPaths,
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

test('re-clicking active field filter restores all-copy target immediately', async ({ page }) => {
  await page.goto('/')
  await installClipboardRecorder(page, 'last-copied-import-validation')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-filter-toggle-off-copy-sync.json', invalidItems)

  const tagFilter = importValidationFieldFilter(page, 'tag')
  await tagFilter.click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()

  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-filter-toggle-off-copy-sync.json\n対象: tag 2件 / 全3件\n$.items[1].tag\n$.items[2].tag',
  )

  // toggle off by re-clicking active field
  await tagFilter.click()
  await expect(tagFilter).toHaveAttribute('aria-pressed', 'false')
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toHaveCount(0)

  await importValidationCopyJsonPaths(page).click()
  await expectOperationStatus(page, 'JSONパス一覧をコピーしました。')
  await expect.poll(() => readClipboardRecorder(page, 'last-copied-import-validation')).toBe(
    'ファイル: invalid-filter-toggle-off-copy-sync.json\n対象: 全3件\n$.items[0].name\n$.items[1].tag\n$.items[2].tag',
  )
})
