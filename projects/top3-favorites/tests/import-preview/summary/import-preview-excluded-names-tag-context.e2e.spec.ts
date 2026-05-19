import { expect, test } from '@playwright/test'
import {
  importPreviewExcludedDetails,
  importPreviewExcludedNames,
  importPreviewLive,
  importPreviewSummary,
  parseImportPreviewSummary,
  resetItemsByReplace,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('excluded store names preview includes tag context when multiple themes exclude same store name', async ({ page }) => {
  await page.goto('/')

  const now = '2026-05-18T00:00:00.000Z'
  const payload = [
    { id: 'latte-1', tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-2', tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-3', tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'latte-4', tag: 'カフェラテ', location: '柏の葉', name: '同名店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-1', tag: 'つけ麺', location: '松戸', name: 'D店', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-2', tag: 'つけ麺', location: '松戸', name: 'E店', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-3', tag: 'つけ麺', location: '松戸', name: 'F店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'ramen-4', tag: 'つけ麺', location: '松戸', name: '同名店', rank: 3, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'excluded-names-tag-context.json', payload)

  const names = importPreviewExcludedNames(page)
  await expect(names).toHaveAttribute('data-excluded-name-count', '2')
  await expect(names).toHaveAttribute('data-excluded-name-labels', 'カフェラテ: 同名店|つけ麺: 同名店')
  await expect(names).toHaveAttribute('data-excluded-name-reason-labels', 'カフェラテ: 同名店（カフェラテでTop3外: 4位相当）|つけ麺: 同名店（つけ麺でTop3外: 4位相当）')
  await expect(names).toHaveText('正規化除外予定の店舗: カフェラテ: 同名店（カフェラテでTop3外: 4位相当）, つけ麺: 同名店（つけ麺でTop3外: 4位相当）')
  await expect(importPreviewLive(page)).toContainText('正規化除外2件（例: カフェラテ: 同名店）')
  await expect(importPreviewExcludedDetails(page)).toHaveText(
    '除外理由: ・カフェラテ: 同名店（カフェラテでTop3外: 4位相当） / ・つけ麺: 同名店（つけ麺でTop3外: 4位相当）',
  )

  const summary = await parseImportPreviewSummary<{ excludedDetailLabels: string[]; excludedNameReasonLabels: string[] }>(importPreviewSummary(page))
  expect(summary.excludedDetailLabels).toEqual([
    'カフェラテ: 同名店',
    'つけ麺: 同名店',
  ])
  expect(summary.excludedNameReasonLabels).toEqual([
    'カフェラテ: 同名店（カフェラテでTop3外: 4位相当）',
    'つけ麺: 同名店（つけ麺でTop3外: 4位相当）',
  ])
})
