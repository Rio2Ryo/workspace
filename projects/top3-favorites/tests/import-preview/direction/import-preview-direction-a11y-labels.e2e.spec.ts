import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems, fetchItems } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('impact direction metrics expose explicit aria-labels for screen readers', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: Array<{ id: string }> }>(request)
  const keepId = current.items[0].id
  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'impact-a11y.json', payload)

  await expect(page.getByTestId('import-preview-metric-added')).toHaveAttribute('aria-label', '追加 1件')
  await expect(page.getByTestId('import-preview-metric-kept')).toHaveAttribute('aria-label', '保持 1件')
  await expect(page.getByTestId('import-preview-metric-removed')).toHaveAttribute('aria-label', '削除予定 2件')
})
