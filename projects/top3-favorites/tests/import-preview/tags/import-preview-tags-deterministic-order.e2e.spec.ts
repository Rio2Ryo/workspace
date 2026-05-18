import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview shows impacted tags in deterministic sorted order', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 't1', tag: 'プリン', location: '浅草', name: 'P1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 't2', tag: 'カフェラテ', location: '柏の葉', name: 'C1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 't3', tag: 'つけ麺', location: '松戸', name: 'T1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'impact-tags-order.json', payload)

  const tags = page.getByTestId('import-preview-impact-tags')
  await expect(tags).toHaveAttribute('data-impact-tag-count', '3')
  await expect(tags).toHaveAttribute('data-impact-tags', 'カフェラテ|つけ麺|プリン')
})
