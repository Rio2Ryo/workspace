import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import confirmation math is consistent for added/kept/removed/excluded counters', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as {
    items: Array<{ id: string }>
  }
  const keepId = current.items[0].id

  const now = new Date().toISOString()
  const payload = [
    // keep one existing id in another tag so it survives Top3 normalization for カフェラテ
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-2', tag: 'カフェラテ', location: '柏の葉', name: 'New 2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-3', tag: 'カフェラテ', location: '柏の葉', name: 'New 3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-4', tag: 'カフェラテ', location: '柏の葉', name: 'New 4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'impact-math.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  // normalized result should be 4 items out of original 5 (one excluded by Top3 normalization)
  await expect(page.getByTestId('import-preview-counts')).toHaveText('現在3件 → インポート後4件')
  await expect(page.getByTestId('import-preview-normalization')).toHaveText('同一タグはTop3に正規化: 5件中4件を反映予定')

  // Added + kept == import-after count (3 + 1 = 4), and removed reflects old rows dropped from DB (2)
  await expect(page.getByTestId('import-preview-impact-math')).toHaveText('追加3件 / 更新・保持1件 / 削除予定2件 / 正規化で除外予定1件')

  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByRole('status')).toContainText('インポート成功: 4件を反映しました。')
})
