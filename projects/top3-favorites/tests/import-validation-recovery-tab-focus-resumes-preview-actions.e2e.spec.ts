import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  importConfirmButton,
  importPreviewSummary,
  importValidationCopyJsonPaths,
  importValidationErrorDetails,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

async function pressTabUntilFocused(page: Page, target: Locator, maxSteps = 20): Promise<boolean> {
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((node) => node === document.activeElement)) return true
  }
  return false
}

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('after valid recovery, Tab navigation can resume on import preview actions (no dead-end focus)', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const invalidItems = [
    { id: 'invalid-name-first', tag: 'カフェラテ', location: '柏の葉', name: '', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'invalid-tag-second', tag: '   ', location: '柏の葉', name: 'Whitespace Tag Shop 1', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'invalid-recovery-tab-focus.json', invalidItems)
  await expect(importValidationErrorDetails(page)).toBeVisible()

  const copyJsonPaths = importValidationCopyJsonPaths(page)
  await expect(copyJsonPaths).toBeVisible()
  await copyJsonPaths.focus()
  await expect(copyJsonPaths).toBeFocused()

  const validItems = [
    { id: 'valid-1', tag: 'プリン', location: '浅草', name: 'Recovery A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'valid-2', tag: 'プリン', location: '浅草', name: 'Recovery B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-recovery-tab-focus.json', validItems)

  await expect(importValidationErrorDetails(page)).toHaveCount(0)
  await expect(importValidationCopyJsonPaths(page)).toHaveCount(0)
  await expect(importPreviewSummary(page)).toBeVisible()

  const confirm = importConfirmButton(page)
  await expect(confirm).toBeVisible()
  const reached = await pressTabUntilFocused(page, confirm)
  expect(reached).toBe(true)
})
