import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import preview explains difference between 削除予定 and 正規化除外', async ({ page }) => {
  await page.goto('/')

  // seed current items so removed count can happen
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'x1', tag: 'カフェラテ', location: '柏の葉', name: 'X1店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x2', tag: 'カフェラテ', location: '柏の葉', name: 'X2店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x3', tag: 'カフェラテ', location: '柏の葉', name: 'X3店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'x4', tag: 'カフェラテ', location: '柏の葉', name: 'X4店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'terms-helper.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await page.getByRole('button', { name: '差分用語の詳細説明を表示' }).click()
  const helper = page.getByTestId('import-preview-terms-helper')
  await expect(helper).toContainText('削除予定: 現在DBにあるが、インポート後データに含まれない項目')
  await expect(helper).toContainText('正規化除外: インポートJSON内で同一タグTop3に収まらず取り込まれない項目')
})
