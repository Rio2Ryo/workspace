import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('import preview explains why each excluded store will not be imported', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'keep-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:04:00.000Z' },
    { id: 'keep-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:03:00.000Z' },
    { id: 'keep-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:02:00.000Z' },
    { id: 'drop-4', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'excluded-reasons.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  const details = page.getByTestId('import-preview-excluded-details')
  await expect(details).toBeVisible()
  await expect(details).toHaveText('除外理由: D店（カフェラテでTop3外: 4位相当）')

  const summaryJson = await page.getByTestId('import-preview-summary').getAttribute('data-summary-json')
  expect(JSON.parse(summaryJson ?? '{}').excludedDetails).toEqual([
    { name: 'D店', tag: 'カフェラテ', reason: 'カフェラテでTop3外: 4位相当' },
  ])
})
