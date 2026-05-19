import { expect, test } from '@playwright/test'
import {
  importPreviewExcludedDetails,
  importPreviewExcludedNames,
  importPreviewSummary,
  parseImportPreviewSummary,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview explains why each excluded store will not be imported', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'keep-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:04:00.000Z' },
    { id: 'keep-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:03:00.000Z' },
    { id: 'keep-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:02:00.000Z' },
    { id: 'drop-4', tag: 'カフェラテ', location: '柏の葉', name: 'D店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: '2026-05-18T00:01:00.000Z' },
  ]

  await uploadJsonImportFile(page, 'excluded-reasons.json', payload)

  const names = importPreviewExcludedNames(page)
  await expect(names).toHaveText('正規化除外予定の店舗: D店（カフェラテでTop3外: 4位相当）')
  await expect(names).toHaveAttribute('data-excluded-name-reason-labels', 'D店（カフェラテでTop3外: 4位相当）')

  const details = importPreviewExcludedDetails(page)
  await expect(details).toBeVisible()
  await expect(details).toHaveText('除外理由: ・D店（カフェラテでTop3外: 4位相当）')

  const summary = await parseImportPreviewSummary<{ excludedDetails: unknown[] }>(importPreviewSummary(page))
  expect(summary.excludedDetails).toEqual([
    { name: 'D店', tag: 'カフェラテ', reason: 'カフェラテでTop3外: 4位相当' },
  ])
})
