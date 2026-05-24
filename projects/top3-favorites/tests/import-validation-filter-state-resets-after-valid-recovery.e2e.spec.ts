import { expect, test } from '@playwright/test'
import {
  importValidationFieldFilter,
  importValidationFilteredRepairStatus,
  importValidationRepairItems,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('field-filter state from invalid import does not leak after valid recovery into next invalid import', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'

  const invalidFirst = [
    { id: 'first-name-1', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'first-tag-1', tag: '   ', location: '柏の葉', name: 'Tag Invalid 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'first-tag-2', tag: '', location: '柏の葉', name: 'Tag Invalid 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-filter-state-first.json', invalidFirst)
  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveCount(2)

  const validItems = [
    { id: 'valid-1', tag: 'プリン', location: '浅草', name: 'Recovery A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'valid-2', tag: 'プリン', location: '浅草', name: 'Recovery B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-filter-state-recovery.json', validItems)

  const invalidSecond = [
    { id: 'second-name-1', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'second-tag-1', tag: '', location: '柏の葉', name: 'Tag Invalid Again', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-filter-state-second.json', invalidSecond)

  // tag filter should not leak from first invalid import
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toHaveCount(0)
  await expect(importValidationRepairItems(page)).toHaveText([
    '1件目 / $.items[0].name / name / 入力値: "" / 店舗名を入力してください。',
    '2件目 / $.items[1].tag / tag / 入力値: "" / タグを入力してください。',
  ])
})
