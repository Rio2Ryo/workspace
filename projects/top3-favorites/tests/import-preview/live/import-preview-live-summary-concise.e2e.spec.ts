import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems, fetchItems, importPreviewLive } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('live summary is concise and mentions only changed elements', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)
  const live = importPreviewLive(page)

  // No-change case: same data re-import
  const current = await fetchItems<{ items: unknown[] }>(request)
  await uploadJsonImportFile(page, 'same.json', current.items)
  await expect(live).toHaveText('差分なし。インポート後3件。')

  // Changed case: keep 1, add 1, remove 2
  const now = new Date().toISOString()
  const currentTyped = await fetchItems<{ items: Array<{ id: string }> }>(request)
  const keepId = currentTyped.items[0].id
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'changed.json', payload)

  await expect(live).toContainText('追加1件')
  await expect(live).toContainText('削除予定2件')
  await expect(live).toContainText('インポート後2件')
  await expect(live).not.toContainText('保持')
})
