import { expect, test } from '@playwright/test'
import {uploadJsonImportFile, parseImportPreviewSummary, resetItemsByReplace, fetchItems, confirmImportAndWaitForStatus, expectImportPreviewCounts} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import normalizes visually equivalent tag spaces before Top3 truncation', async ({ page, request }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const items = [
    { id: 'tag-space-1', tag: 'カフェ ラテ', location: '柏の葉', name: 'A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'tag-space-2', tag: 'カフェ　ラテ', location: '柏の葉', name: 'B', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'tag-space-3', tag: 'カフェ ラテ', location: '柏の葉', name: 'C', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'tag-space-4', tag: 'カフェ　ラテ', location: '柏の葉', name: 'D', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2000-01-01T00:00:00.000Z' },
  ]

  await uploadJsonImportFile(page, 'tag-space-normalization.json', items)

  await expectImportPreviewCounts(page, 0, 3)
  await expect(page.getByTestId('import-preview-normalization')).toHaveText('同一タグはTop3に正規化: 4件中3件を反映予定')
  await expect(page.getByTestId('import-preview-excluded-names')).toHaveText('正規化除外予定の店舗: D')

  const summary = await parseImportPreviewSummary<{ tags: string[]; excludedNames: string[] }>(page.getByTestId('import-preview-summary'))
  expect(summary.tags).toEqual(['カフェ ラテ'])
  expect(summary.excludedNames).toEqual(['D'])

  await confirmImportAndWaitForStatus(page, 'インポート成功')

  const data = await fetchItems<{ items: Array<{ tag: string; name: string; rank: number }> }>(request)
  expect(data.items.map((item) => item.name).sort()).toEqual(['A', 'B', 'C'])
  expect(Array.from(new Set(data.items.map((item) => item.tag)))).toEqual(['カフェ ラテ'])
  expect(data.items.map((item) => item.rank).sort()).toEqual([1, 2, 3])
})
