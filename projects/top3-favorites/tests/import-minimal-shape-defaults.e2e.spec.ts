import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('UI import accepts minimal valid items and fills generated fields before API replace', async ({ page, request }) => {
  await page.goto('/')

  const payload = [
    { id: 'minimal-1', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal A', rank: 3, memo: '' },
    { id: 'minimal-2', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal B', rank: 3, memo: '' },
    { id: 'minimal-3', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal C', rank: 3, memo: '' },
    { id: 'minimal-4', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal D', rank: 3, memo: '' },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'minimal-shape.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-counts')).toHaveAttribute('data-after-count', '3')
  await expect(page.getByTestId('import-preview-normalization')).toHaveAttribute('data-normalization-before-count', '4')
  await expect(page.getByTestId('import-preview-normalization')).toHaveAttribute('data-normalization-after-count', '3')

  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByRole('status')).toContainText('インポート成功: 3件を反映しました。')

  const data = (await request.get('/api/items').then((res) => res.json())) as {
    items: Array<{ id: string; createdAt: string; updatedAt: string; mapsUrl: string; placeId: string }>
  }
  expect(data.items).toHaveLength(3)
  for (const item of data.items) {
    expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(item.mapsUrl).toContain('https://www.google.com/maps/search/')
    expect(item.placeId).toBe('')
  }
})
