import { expect, test } from '@playwright/test'
import {uploadJsonImportFile, resetItemsByReplace, fetchItems, confirmImportAndWaitForStatus, importPreviewCounts} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('UI import accepts minimal valid items and fills generated fields before API replace', async ({ page, request }) => {
  await page.goto('/')

  const payload = [
    { id: 'minimal-1', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal A', rank: 3, memo: '' },
    { id: 'minimal-2', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal B', rank: 3, memo: '' },
    { id: 'minimal-3', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal C', rank: 3, memo: '' },
    { id: 'minimal-4', tag: 'カフェラテ', location: '柏の葉', name: 'Minimal D', rank: 3, memo: '' },
  ]

  await uploadJsonImportFile(page, 'minimal-shape.json', payload)

  await expect(importPreviewCounts(page)).toHaveAttribute('data-after-count', '3')
  await expect(page.getByTestId('import-preview-normalization')).toHaveAttribute('data-normalization-before-count', '4')
  await expect(page.getByTestId('import-preview-normalization')).toHaveAttribute('data-normalization-after-count', '3')

  await confirmImportAndWaitForStatus(page, 'インポート成功: 3件を反映しました。')

  const data = await fetchItems<{
    items: Array<{ id: string; createdAt: string; updatedAt: string; mapsUrl: string; placeId: string }>
  }>(request)
  expect(data.items).toHaveLength(3)
  for (const item of data.items) {
    expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(item.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(item.mapsUrl).toContain('https://www.google.com/maps/search/')
    expect(item.placeId).toBe('')
  }
})
