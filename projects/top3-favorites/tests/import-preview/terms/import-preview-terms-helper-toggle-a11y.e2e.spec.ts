import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('terms helper toggle exposes aria-expanded and aria-controls correctly', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const now = new Date().toISOString()
  const payload = [
    { id: 'x1', tag: 'カフェラテ', location: '柏の葉', name: 'X1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x2', tag: 'カフェラテ', location: '柏の葉', name: 'X2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x3', tag: 'カフェラテ', location: '柏の葉', name: 'X3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x4', tag: 'カフェラテ', location: '柏の葉', name: 'X4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'terms-toggle-a11y.json', payload)

  const toggle = page.getByTestId('import-preview-toggle-terms-helper')
  await expect(toggle).toHaveAttribute('aria-controls', 'import-preview-terms-helper')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#import-preview-terms-helper')).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
