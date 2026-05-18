import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems } from '../../e2e-helpers'

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
  await resetItemsByReplace(request)
})

test('import confirmation summarizes added removed kept items and tag impact', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const replacement = [
    item('same-id', 'カフェラテ', 'Kept Latte'),
    item('new-id', 'プリン', 'New Pudding'),
  ]

  // Make one imported id match an existing saved id so the preview can distinguish kept vs added.
  const current = await page.request.get('/api/items').then((res) => res.json()) as { items: { id: string }[] }
  replacement[0].id = current.items[0].id

  await uploadJsonImportFile(page, 'impact-import.json', replacement)

  const preview = page.locator('[aria-label="インポート確認"]')
  await expect(preview).toContainText('現在3件 → インポート後2件')
  await expect(preview).toContainText('追加1件 / 更新・保持1件 / 削除予定2件')
  await expect(preview).toContainText('影響タグ: カフェラテ, つけ麺, プリン')
})
