import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems, fetchItems , importPreviewMetricAdded, importPreviewMetricKept, importPreviewMetricRemoved} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('impact direction metrics expose semantic color classes for quick scan', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: Array<{ id: string }> }>(request)
  const keepId = current.items[0].id
  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'impact-color-classes.json', payload)

  await expect(importPreviewMetricAdded(page)).toHaveClass(/impact-plus/)
  await expect(importPreviewMetricKept(page)).toHaveClass(/impact-neutral/)
  await expect(importPreviewMetricRemoved(page)).toHaveClass(/impact-minus/)
})
