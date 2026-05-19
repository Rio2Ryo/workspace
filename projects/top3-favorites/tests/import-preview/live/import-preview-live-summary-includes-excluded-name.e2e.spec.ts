import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, importPreviewLive } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('live summary mentions a representative excluded shop name when normalization excludes items', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'live-excluded-name.json', payload)

  const live = importPreviewLive(page)
  await expect(live).toContainText('正規化除外1件')
  await expect(live).toContainText('例: C店')
})
