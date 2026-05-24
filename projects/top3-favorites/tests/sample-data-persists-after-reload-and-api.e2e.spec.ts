import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  fetchItems,
  rankedItemSummary,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  saveSampleItems,
  searchSection as searchSectionLocator,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sample data seed remains after reload and is reflected in API data', async ({ page, request }) => {
  await page.goto('/')

  await saveSampleItems(page)

  const searchSection = searchSectionLocator(page)
  await expect(rankedItemSummary(searchSection, 1, 'Solito MAGO')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 2, 'T-SITEのカフェ')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'とみ田')).toBeVisible()

  await reloadPageAndWaitForSearchReady(page)

  await expect(rankedItemSummary(searchSection, 1, 'Solito MAGO')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 2, 'T-SITEのカフェ')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'とみ田')).toBeVisible()

  const apiData = await fetchItems<{
    items: { tag: string; location: string; name: string; rank: number; memo: string }[]
  }>(request)

  expect(canonicalizeItemsById(apiData.items.map(({ tag, location, name, rank, memo }) => ({ tag, location, name, rank, memo })))).toBe(
    canonicalizeItemsById([
      { tag: 'カフェラテ', location: '柏の葉', name: 'Solito MAGO', rank: 1, memo: 'ラテアートがきれい。ミルク感も好き' },
      { tag: 'カフェラテ', location: '柏の葉', name: 'T-SITEのカフェ', rank: 2, memo: '作業ついでに寄りやすい' },
      { tag: 'つけ麺', location: '松戸', name: 'とみ田', rank: 1, memo: '濃厚つけ麺が強い' },
    ]),
  )
})
