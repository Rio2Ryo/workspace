import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('UI shows only Top3 after importing 4 items of same tag', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const items = [
    { id: 'u1', tag: 'カフェラテ', location: '柏の葉', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u2', tag: 'カフェラテ', location: '柏の葉', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u3', tag: 'カフェラテ', location: '柏の葉', name: 'C', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'u4', tag: 'カフェラテ', location: '柏の葉', name: 'D', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'same-tag-4items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(items), 'utf-8'),
  })

  await expect(page.getByText('現在0件 → インポート後3件')).toBeVisible()
  await expect(page.getByText('同一タグはTop3に正規化: 4件中3件を反映予定')).toBeVisible()
  await expect(page.getByText('追加3件 / 更新・保持0件 / 削除予定0件')).toBeVisible()
  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByText(/インポート成功/)).toBeVisible()

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェラテ' }) })
  await expect(group.getByText(/位:/)).toHaveCount(3)

  const listText = await group.textContent()
  expect(listText ?? '').not.toContain('4位')
})
