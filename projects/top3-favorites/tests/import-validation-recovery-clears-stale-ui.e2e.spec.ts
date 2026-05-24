import { expect, test } from '@playwright/test'
import {
  importPreviewSummary,
  importValidationCopyJsonPaths,
  importValidationErrorDetails,
  importValidationFieldFilter,
  importValidationFilteredRepairStatus,
  importValidationRepairItems,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('valid re-import after validation error clears stale validation UI state and copy actions', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-third', tag: '', location: '柏の葉', name: 'Whitespace Tag Shop 2', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-recovery-clears-ui.json', invalidItems)
  await expect(importValidationErrorDetails(page)).toBeVisible()

  await importValidationFieldFilter(page, 'tag').click()
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toBeVisible()
  await expect(importValidationRepairItems(page)).toHaveCount(2)
  await expect(importValidationCopyJsonPaths(page)).toBeVisible()

  const validItems = [
    { id: 'valid-1', tag: 'プリン', location: '浅草', name: 'Recovery A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'valid-2', tag: 'プリン', location: '浅草', name: 'Recovery B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-recovery-clears-ui.json', validItems)

  // stale validation UI should be gone after valid preview state
  await expect(importValidationErrorDetails(page)).toHaveCount(0)
  await expect(importValidationFilteredRepairStatus(page, 'tag', 2)).toHaveCount(0)
  await expect(importValidationCopyJsonPaths(page)).toHaveCount(0)

  // valid import preview should be active instead
  await expect(importPreviewSummary(page)).toBeVisible()
})
