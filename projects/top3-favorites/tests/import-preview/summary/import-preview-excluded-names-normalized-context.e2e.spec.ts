import { expect, test } from '@playwright/test'
import {
  importPreviewExcludedNameVariants,
  importPreviewExcludedNames,
  importPreviewSummary,
  parseImportPreviewSummary,
  resetItemsByReplace,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded store names add tag context for visually equivalent full-width and spaced names', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'latte-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
    { id: 'latte-4', tag: 'カフェラテ', location: '柏の葉', name: 'Cafe K', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:00:00.000Z' },
    { id: 'dessert-1', tag: 'プリン', location: '松戸', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'dessert-2', tag: 'プリン', location: '松戸', name: 'E店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'dessert-3', tag: 'プリン', location: '松戸', name: 'F店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
    { id: 'dessert-4', tag: 'プリン', location: '松戸', name: 'Ｃａｆｅ　Ｋ', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:00:00.000Z' },
  ]

  await uploadJsonImportFile(page, 'excluded-names-normalized-context.json', payload)

  const names = importPreviewExcludedNames(page)
  await expect(names).toHaveAttribute('data-excluded-name-count', '2')
  await expect(names).toHaveAttribute('data-excluded-name-labels', 'カフェラテ: Cafe K|プリン: Ｃａｆｅ　Ｋ')
  await expect(names).toHaveAttribute('data-excluded-name-reason-labels', 'カフェラテ: Cafe K（カフェラテでTop3外: 4位相当）|プリン: Ｃａｆｅ　Ｋ（プリンでTop3外: 4位相当）')
  await expect(names).toHaveText('正規化除外予定の店舗: カフェラテ: Cafe K（カフェラテでTop3外: 4位相当）, プリン: Ｃａｆｅ　Ｋ（プリンでTop3外: 4位相当）')

  const variants = importPreviewExcludedNameVariants(page)
  await expect(variants).toHaveText('表記ゆれ候補: カフェラテ: Cafe K / プリン: Ｃａｆｅ　Ｋ')
  await expect(variants).toHaveAttribute('data-normalized-excluded-name-groups', 'cafe k=カフェラテ: Cafe K/プリン: Ｃａｆｅ　Ｋ')

  const summary = await parseImportPreviewSummary<{
    excludedDetailLabels: string[]
    excludedNameReasonLabels: string[]
    normalizedExcludedNameGroups: Array<{ key: string; names: string[]; labels: string[] }>
  }>(importPreviewSummary(page))
  expect(summary.excludedDetailLabels).toEqual([
    'カフェラテ: Cafe K',
    'プリン: Ｃａｆｅ　Ｋ',
  ])
  expect(summary.excludedNameReasonLabels).toEqual([
    'カフェラテ: Cafe K（カフェラテでTop3外: 4位相当）',
    'プリン: Ｃａｆｅ　Ｋ（プリンでTop3外: 4位相当）',
  ])
  expect(summary.normalizedExcludedNameGroups).toEqual([
    {
      key: 'cafe k',
      names: ['Cafe K', 'Ｃａｆｅ　Ｋ'],
      labels: ['カフェラテ: Cafe K', 'プリン: Ｃａｆｅ　Ｋ'],
    },
  ])
})
