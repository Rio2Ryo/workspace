import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  expectOperationStatus,
  importCancelButton,
  importPreviewSummary,
  registrationTagField,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

async function pressTabUntilFocused(page: Page, target: Locator, maxSteps = 24): Promise<boolean> {
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((node) => node === document.activeElement)) return true
  }
  return false
}

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview cancel is reachable by keyboard and focus returns to registration form', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const validItems = [
    { id: 'valid-1', tag: 'プリン', location: '浅草', name: 'Preview A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'valid-2', tag: 'プリン', location: '浅草', name: 'Preview B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'valid-preview-cancel-keyboard-focus.json', validItems)
  await expect(importPreviewSummary(page)).toBeVisible()

  const cancelButton = importCancelButton(page)
  await expect(cancelButton).toBeVisible()
  const reached = await pressTabUntilFocused(page, cancelButton)
  expect(reached).toBe(true)

  await page.keyboard.press('Enter')
  await expectOperationStatus(page, 'インポートをキャンセルしました。')
  await expect(importPreviewSummary(page)).toHaveCount(0)

  const tagField = registrationTagField(page)
  await expect(tagField).toBeVisible()
  await expect(tagField).toBeFocused()
})
