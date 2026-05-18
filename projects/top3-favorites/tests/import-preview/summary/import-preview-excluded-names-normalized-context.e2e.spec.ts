import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded store names add tag context for visually equivalent full-width and spaced names', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'latte-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
    { id: 'latte-4', tag: 'カフェラテ', location: '柏の葉', name: 'Cafe K', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:00:00.000Z' },
    { id: 'dessert-1', tag: 'プリン', location: '松戸', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'dessert-2', tag: 'プリン', location: '松戸', name: 'E店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'dessert-3', tag: 'プリン', location: '松戸', name: 'F店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
    { id: 'dessert-4', tag: 'プリン', location: '松戸', name: 'Ｃａｆｅ　Ｋ', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:00:00.000Z' },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'excluded-names-normalized-context.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const names = page.getByTestId('import-preview-excluded-names')
  await expect(names).toHaveAttribute('data-excluded-name-count', '2')
  await expect(names).toHaveAttribute('data-excluded-name-labels', 'カフェラテ: Cafe K|プリン: Ｃａｆｅ　Ｋ')
  await expect(names).toHaveText('除外予定の店舗: カフェラテ: Cafe K, プリン: Ｃａｆｅ　Ｋ')

  const variants = page.getByTestId('import-preview-excluded-name-variants')
  await expect(variants).toHaveText('表記ゆれ候補: Cafe K / Ｃａｆｅ　Ｋ')
  await expect(variants).toHaveAttribute('data-normalized-excluded-name-groups', 'cafe k=Cafe K/Ｃａｆｅ　Ｋ')

  const summaryJson = await page.getByTestId('import-preview-summary').getAttribute('data-summary-json')
  const summary = JSON.parse(summaryJson ?? '{}')
  expect(summary.excludedDetailLabels).toEqual([
    'カフェラテ: Cafe K',
    'プリン: Ｃａｆｅ　Ｋ',
  ])
  expect(summary.normalizedExcludedNameGroups).toEqual([
    { key: 'cafe k', names: ['Cafe K', 'Ｃａｆｅ　Ｋ'] },
  ])
})
