import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import rejects whitespace-only required fields with clear validation message', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const now = new Date().toISOString()
  const invalidItems = [
    {
      id: '   ',
      tag: 'カフェラテ',
      location: '柏の葉',
      name: 'Bad Item',
      rank: 1,
      memo: '',
      mapsUrl: '',
      placeId: '',
      createdAt: now,
      updatedAt: now,
    },
  ]

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'invalid-whitespace-fields.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalidItems), 'utf-8'),
  })

  await expect(page.getByText('インポート失敗: 不正な要素が含まれています。既存データは保持しました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})
