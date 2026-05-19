import { expect, test } from '@playwright/test'
import { importPreviewExcludedDetails, importPreviewToggleExcludedDetails, resetItemsByReplace, uploadJsonImportFile } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded details can be expanded to show all reasons and collapsed back', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e', tag: 'カフェラテ', location: '柏の葉', name: 'E店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f', tag: 'カフェラテ', location: '柏の葉', name: 'F店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'g', tag: 'カフェラテ', location: '柏の葉', name: 'G店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'excluded-expand.json', payload)

  const details = importPreviewExcludedDetails(page)
  await expect(details).toContainText('F店')
  await expect(details).toContainText('G店')
  await expect(details).toContainText('B店')
  await expect(details).not.toContainText('C店')
  await expect(details).toContainText('4位相当')
  await expect(details).toContainText('5位相当')
  await expect(details).toContainText('6位相当')
  await expect(details).toContainText('ほか1件')

  await importPreviewToggleExcludedDetails(page).click()
  await expect(details).toContainText('C店')
  await expect(details).not.toContainText('ほか1件')
  await expect(importPreviewToggleExcludedDetails(page)).toBeVisible()

  await importPreviewToggleExcludedDetails(page).click()
  await expect(details).not.toContainText('C店')
  await expect(details).toContainText('ほか1件')
})
