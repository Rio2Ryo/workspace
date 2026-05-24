import { expect, test } from '@playwright/test'
import {
  importPreviewSummary,
  importValidationCopyJsonPaths,
  importValidationErrorDetails,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('valid recovery removes stale copy action and clears its keyboard focus target', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-recovery-clears-copy-focus.json', invalidItems)
  await expect(importValidationErrorDetails(page)).toBeVisible()

  const copyJsonPaths = importValidationCopyJsonPaths(page)
  await expect(copyJsonPaths).toBeVisible()
  await copyJsonPaths.focus()
  await expect(copyJsonPaths).toBeFocused()

  const validItems = [
    { id: 'valid-1', tag: 'プリン', location: '浅草', name: 'Recovery A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'valid-2', tag: 'プリン', location: '浅草', name: 'Recovery B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-recovery-clears-copy-focus.json', validItems)

  await expect(importValidationCopyJsonPaths(page)).toHaveCount(0)
  await expect(importValidationErrorDetails(page)).toHaveCount(0)
  await expect(importPreviewSummary(page)).toBeVisible()

  await expect.poll(async () => {
    return page.evaluate(() => (document.activeElement as HTMLElement | null)?.tagName ?? '')
  }).toBe('BODY')
})
