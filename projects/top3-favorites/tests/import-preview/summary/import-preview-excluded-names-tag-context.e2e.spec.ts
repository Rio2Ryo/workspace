import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded store names preview includes tag context when multiple themes exclude same store name', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'latte-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-4', tag: 'カフェラテ', location: '柏の葉', name: '同名店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-1', tag: 'つけ麺', location: '松戸', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-2', tag: 'つけ麺', location: '松戸', name: 'E店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-3', tag: 'つけ麺', location: '松戸', name: 'F店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-4', tag: 'つけ麺', location: '松戸', name: '同名店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'excluded-names-tag-context.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const names = page.getByTestId('import-preview-excluded-names')
  await expect(names).toHaveAttribute('data-excluded-name-count', '2')
  await expect(names).toHaveAttribute('data-excluded-name-labels', 'カフェラテ: 同名店|つけ麺: 同名店')
  await expect(names).toHaveText('除外予定の店舗: カフェラテ: 同名店, つけ麺: 同名店')
  await expect(page.getByTestId('import-preview-live')).toContainText('正規化除外2件（例: カフェラテ: 同名店）')
})
