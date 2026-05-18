import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('impact direction metrics expose explicit aria-labels for screen readers', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: Array<{ id: string }> }
  const keepId = current.items[0].id
  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'impact-a11y.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-metric-added')).toHaveAttribute('aria-label', '追加 1件')
  await expect(page.getByTestId('import-preview-metric-kept')).toHaveAttribute('aria-label', '保持 1件')
  await expect(page.getByTestId('import-preview-metric-removed')).toHaveAttribute('aria-label', '削除予定 2件')
})
