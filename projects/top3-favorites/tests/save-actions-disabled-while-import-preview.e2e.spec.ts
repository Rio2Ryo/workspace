import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('save actions are disabled while import preview is active', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'pending.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  await expect(page.getByRole('button', { name: 'DBに保存' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'サンプルをDB保存' })).toBeDisabled()
})
