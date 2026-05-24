import { expect, test } from '@playwright/test'
import {
  importValidationFieldClear,
  importValidationFieldFilter,
  importValidationFilteredRepairStatus,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import validation field filters support keyboard activation and focus flow', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-filter-keyboard-a11y.json', invalidItems)

  const tagFilter = importValidationFieldFilter(page, 'tag')
  const nameFilter = importValidationFieldFilter(page, 'name')

  await tagFilter.focus()
  await expect(tagFilter).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(tagFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(nameFilter).toBeFocused()

  await page.keyboard.press(' ')
  await expect(nameFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(tagFilter).toHaveAttribute('aria-pressed', 'false')
  await expect(importValidationFilteredRepairStatus(page, 'name', 1)).toBeVisible()

  const clearFilter = importValidationFieldClear(page)
  await page.keyboard.press('Tab')
  await expect(clearFilter).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(tagFilter).toHaveAttribute('aria-pressed', 'false')
  await expect(nameFilter).toHaveAttribute('aria-pressed', 'false')
  await expect(importValidationFilteredRepairStatus(page, 'name', 1)).toHaveCount(0)
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toHaveCount(0)
})
