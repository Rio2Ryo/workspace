import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('all import preview toggles use consistent aria-label prefix without colliding with the panel label', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'a1', tag: 'A', location: '柏', name: 'A1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a2', tag: 'A', location: '柏', name: 'A2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a3', tag: 'A', location: '柏', name: 'A3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'a4', tag: 'A', location: '柏', name: 'A4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b1', tag: 'B', location: '柏', name: 'B1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b2', tag: 'B', location: '柏', name: 'B2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b3', tag: 'B', location: '柏', name: 'B3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b4', tag: 'B', location: '柏', name: 'B4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c1', tag: 'C', location: '柏', name: 'C1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c2', tag: 'C', location: '柏', name: 'C2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c3', tag: 'C', location: '柏', name: 'C3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'c4', tag: 'C', location: '柏', name: 'C4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd1', tag: 'D', location: '柏', name: 'D1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd2', tag: 'D', location: '柏', name: 'D2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd3', tag: 'D', location: '柏', name: 'D3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'd4', tag: 'D', location: '柏', name: 'D4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e1', tag: 'E', location: '柏', name: 'E1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e2', tag: 'E', location: '柏', name: 'E2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e3', tag: 'E', location: '柏', name: 'E3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'e4', tag: 'E', location: '柏', name: 'E4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f1', tag: 'F', location: '柏', name: 'F1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f2', tag: 'F', location: '柏', name: 'F2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f3', tag: 'F', location: '柏', name: 'F3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'f4', tag: 'F', location: '柏', name: 'F4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'toggle-aria-label-consistency.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const tagsToggle = page.getByTestId('import-preview-toggle-impact-tags')
  const excludedToggle = page.getByTestId('import-preview-toggle-excluded-details')
  const termsToggle = page.getByTestId('import-preview-toggle-terms-helper')

  await expect(page.getByLabel('インポート確認')).toHaveCount(1)
  await expect(tagsToggle).toHaveAttribute('aria-label', /^インポート詳細: 影響タグを全件表示/)
  await expect(excludedToggle).toHaveAttribute('aria-label', /^インポート詳細: 除外理由を全件表示/)
  await expect(termsToggle).toHaveAttribute('aria-label', /^インポート詳細: 差分用語の詳細説明を表示/)

  await tagsToggle.click()
  await excludedToggle.click()
  await termsToggle.click()

  await expect(page.getByLabel('インポート確認')).toHaveCount(1)
  await expect(tagsToggle).toHaveAttribute('aria-label', /^インポート詳細: 影響タグを折りたたむ/)
  await expect(excludedToggle).toHaveAttribute('aria-label', /^インポート詳細: 除外理由を折りたたむ/)
  await expect(termsToggle).toHaveAttribute('aria-label', /^インポート詳細: 差分用語の詳細説明を隠す/)
})
