import { expect, test } from '@playwright/test'
import {
  fetchItems,
  importPreviewMetricAdded,
  importPreviewMetricKept,
  importPreviewMetricRemoved,
  resetItemsByReplace,
  saveSampleItems,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import impact metrics show directional signs (+ / ± / -)', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: Array<{ id: string }> }>(request)
  const keepId = current.items[0].id
  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'impact-direction.json', payload)

  await expect(importPreviewMetricAdded(page)).toHaveText(/\+1\s*追加/)
  await expect(importPreviewMetricKept(page)).toHaveText(/±1\s*保持/)
  await expect(importPreviewMetricRemoved(page)).toHaveText(/-2\s*削除予定/)
})
