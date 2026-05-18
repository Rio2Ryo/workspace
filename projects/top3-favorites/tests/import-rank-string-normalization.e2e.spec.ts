import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('import preview handles string ranks and still normalizes same tag to Top3', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 's1', tag: 'カフェラテ', location: '柏の葉', name: 'S1', rank: '1', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's2', tag: 'カフェラテ', location: '柏の葉', name: 'S2', rank: '2', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's3', tag: 'カフェラテ', location: '柏の葉', name: 'S3', rank: '3', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 's4', tag: 'カフェラテ', location: '柏の葉', name: 'S4', rank: '1', memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'rank-string.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await expect(page.getByText('現在0件 → インポート後3件')).toBeVisible()
  await expect(page.getByText('同一タグはTop3に正規化: 4件中3件を反映予定')).toBeVisible()
  await expect(page.getByTestId('import-preview-impact-math')).toContainText('正規化除外1件')
  await expect(page.getByText(/^除外予定の店舗:/)).toBeVisible()

  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByRole('status')).toContainText('インポート成功: 3件を反映しました。')

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェラテ' }) })
  await expect(group.getByText(/位:/)).toHaveCount(3)
})
