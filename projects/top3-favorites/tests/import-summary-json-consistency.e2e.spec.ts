import { expect, test } from '@playwright/test'
import {
  fetchItems,
  importPreviewExcludedNames,
  importPreviewSummary,
  parseImportPreviewSummary,
  resetItemsByReplace,
  saveSampleItems,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview exposes a consistent summary JSON for QA assertions', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: Array<{ id: string }> }>(request)
  const keepId = current.items[0].id

  const now = new Date().toISOString()
  const payload = [
    { id: keepId, tag: 'プリン', location: '浅草', name: 'Keep Existing', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-1', tag: 'カフェラテ', location: '柏の葉', name: 'New 1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-2', tag: 'カフェラテ', location: '柏の葉', name: 'New 2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-3', tag: 'カフェラテ', location: '柏の葉', name: 'New 3', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'new-4', tag: 'カフェラテ', location: '柏の葉', name: 'New 4', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'summary-json.json', payload)

  const summary = await parseImportPreviewSummary<{
    before: number
    after: number
    normalizationBefore: number
    normalizationAfter: number
    added: number
    kept: number
    removed: number
    excluded: number
    tags: string[]
    excludedNames: string[]
    excludedNameLabels: string[]
  }>(importPreviewSummary(page))

  expect(summary.before).toBe(3)
  expect(summary.after).toBe(4)
  expect(summary.normalizationBefore).toBe(5)
  expect(summary.normalizationAfter).toBe(4)
  expect(summary.added + summary.kept).toBe(summary.after)
  expect(summary.before - summary.removed).toBe(summary.kept)
  expect(summary.excluded).toBe(1)
  expect(summary.excludedNames).toEqual(['New 3'])
  expect(summary.excludedNameLabels).toEqual(['New 3'])
  expect(summary.tags).toEqual(['カフェラテ', 'つけ麺', 'プリン'].sort((a, b) => a.localeCompare(b, 'ja')))

  const excludedNames = importPreviewExcludedNames(page)
  await expect(excludedNames.getByText('正規化除外予定の店舗:')).toBeVisible()
  await expect(excludedNames.getByRole('listitem')).toHaveText('New 3（カフェラテでTop3外: 4位相当）')
})
