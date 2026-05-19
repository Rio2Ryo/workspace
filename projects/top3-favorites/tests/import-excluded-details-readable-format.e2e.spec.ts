import { expect, test } from '@playwright/test'
import { importPreviewExcludedDetails, resetItemsByReplace, uploadJsonImportFile,
  importPreviewListItems,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded details are rendered in a readable bullet-like format', async ({ page }) => {
  await page.goto('/')

  const createdAt = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'a', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt, updatedAt: '2026-05-18T00:05:00.000Z' },
    { id: 'b', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt, updatedAt: '2026-05-18T00:04:00.000Z' },
    { id: 'c', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt, updatedAt: '2026-05-18T00:03:00.000Z' },
    { id: 'd', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt, updatedAt: '2026-05-18T00:02:00.000Z' },
    { id: 'e', tag: 'カフェラテ', location: '柏の葉', name: 'E店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt, updatedAt: '2026-05-18T00:01:00.000Z' },
  ]

  await uploadJsonImportFile(page, 'excluded-format.json', payload)

  const details = importPreviewExcludedDetails(page)
  await expect(details).toHaveAttribute('aria-label', 'Top3外で正規化除外された理由')
  await expect(importPreviewListItems(details)).toHaveCount(2)
  await expect(importPreviewListItems(details).nth(0)).toHaveText('D店（カフェラテでTop3外: 4位相当）')
  await expect(importPreviewListItems(details).nth(1)).toHaveText('E店（カフェラテでTop3外: 5位相当）')
})
