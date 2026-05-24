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

test('import validation field filter selection resets when a new invalid import is loaded', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const firstInvalidItems = [
    { id: 'first-name-1', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'first-tag-1', tag: '   ', location: '柏の葉', name: 'Tag Invalid', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-first.json', firstInvalidItems)
  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 1)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveText([
    '2件目 / $.items[1].tag / tag / 入力値: "   " / タグを入力してください。',
  ])

  const secondInvalidItems = [
    { id: 'second-name-1', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'second-tag-1', tag: '', location: '柏の葉', name: 'Tag Invalid Again', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-second.json', secondInvalidItems)

  // filter should not leak from previous invalid import
  await expect(importValidationFilteredRepairStatus(page, 'tag', 1)).toHaveCount(0)
  await expect(importValidationRepairItems(page)).toHaveText([
    '1件目 / $.items[0].name / name / 入力値: "" / 店舗名を入力してください。',
    '2件目 / $.items[1].tag / tag / 入力値: "" / タグを入力してください。',
  ])
})
