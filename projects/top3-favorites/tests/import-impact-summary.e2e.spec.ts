import { expect, test } from '@playwright/test'

function item(id: string, tag: string, name: string, rank = 1) {
  const now = new Date().toISOString()
  return {
    id,
    tag,
    location: '柏の葉',
    name,
    rank,
    memo: 'impact summary test',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
    placeId: '',
    createdAt: now,
    updatedAt: now,
  }
}

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const existing of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(existing.id)}`)
  }
})

test('import confirmation summarizes added removed kept items and tag impact', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const replacement = [
    item('same-id', 'カフェラテ', 'Kept Latte'),
    item('new-id', 'プリン', 'New Pudding'),
  ]

  // Make one imported id match an existing saved id so the preview can distinguish kept vs added.
  const current = await page.request.get('/api/items').then((res) => res.json()) as { items: { id: string }[] }
  replacement[0].id = current.items[0].id

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'impact-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(replacement), 'utf-8'),
  })

  const preview = page.locator('[aria-label="インポート確認"]')
  await expect(preview).toContainText('現在3件 → インポート後2件')
  await expect(preview).toContainText('追加1件 / 更新・保持1件 / 削除予定2件')
  await expect(preview).toContainText('影響タグ: カフェラテ, つけ麺, プリン')
})
