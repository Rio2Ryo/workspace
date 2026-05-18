import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import preview exposes aria-live region and updates when file is replaced', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payloadA = [
    { id: 'a1', tag: 'A', location: '柏', name: 'A1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const payloadB = [
    { id: 'b1', tag: 'B', location: '柏', name: 'B1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'b2', tag: 'B', location: '柏', name: 'B2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'live-a.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payloadA), 'utf-8'),
  })

  const live = page.getByTestId('import-preview-live')
  await expect(live).toHaveAttribute('aria-live', 'polite')
  await expect(live).toHaveAttribute('aria-atomic', 'true')
  await expect(live).toHaveText('追加1件 / 削除予定0件 / インポート後1件。')
  await expect(page.getByTestId('import-preview-counts')).toContainText('現在0件 → インポート後1件')

  await fileInput.setInputFiles({
    name: 'live-b.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payloadB), 'utf-8'),
  })

  await expect(live).toHaveText('追加2件 / 削除予定0件 / インポート後2件。')
  await expect(page.getByTestId('import-preview-counts')).toContainText('現在0件 → インポート後2件')
})
