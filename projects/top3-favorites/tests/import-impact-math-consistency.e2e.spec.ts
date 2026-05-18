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
  const counts = page.getByTestId('import-preview-counts')
  await expect(counts).toHaveAttribute('data-before-count', '3')
  await expect(counts).toHaveAttribute('data-after-count', '4')
  await expect(page.getByTestId('import-preview-normalization')).toContainText('5件中4件')

  // Added + kept == after, and before - removed == kept
  const math = page.getByTestId('import-preview-impact-math')
  const [beforeCount, afterCount, addedCount, keptCount, removedCount, excludedCount] = await Promise.all([
    counts.getAttribute('data-before-count'),
    counts.getAttribute('data-after-count'),
    math.getAttribute('data-added-count'),
    math.getAttribute('data-kept-count'),
    math.getAttribute('data-removed-count'),
    math.getAttribute('data-excluded-count'),
  ])

  const before = Number(beforeCount)
  const after = Number(afterCount)
  const added = Number(addedCount)
  const kept = Number(keptCount)
  const removed = Number(removedCount)
  const excluded = Number(excludedCount)

  expect(added + kept).toBe(after)
  expect(before - removed).toBe(kept)
  expect(excluded).toBe(1)

  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByRole('status')).toContainText('インポート成功: 4件を反映しました。')
})
