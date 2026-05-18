import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('import preview shows excluded store names in deterministic sorted order', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'x1', tag: 'カフェラテ', location: '柏の葉', name: 'Z店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x2', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x3', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x4', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x5', tag: 'カフェラテ', location: '柏の葉', name: 'Y店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'excluded-order.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const normalization = page.getByTestId('import-preview-normalization')
  await expect(normalization).toHaveAttribute('data-normalization-before-count', '5')
  await expect(normalization).toHaveAttribute('data-normalization-after-count', '3')
  await expect(page.getByTestId('import-preview-impact-math')).toHaveText('追加3件 / 更新・保持0件 / 削除予定0件 / 正規化除外2件')

  // Excluded names should be deterministic (ja locale sort), not input-order dependent
  await expect(page.getByTestId('import-preview-excluded-names')).toHaveText('除外予定の店舗: Y店, Z店')
})
