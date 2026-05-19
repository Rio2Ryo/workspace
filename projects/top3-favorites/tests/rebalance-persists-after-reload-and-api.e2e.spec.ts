import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  fetchItems,
  postItem,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationRankButton,
  registrationSaveButton,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('adding new 1st place rebalances to Top3 and persists ranks after reload + API', async ({ page, request }) => {
  const seed = [
    { tag: 'カフェラテ', location: '柏の葉', name: 'A店', rank: 1, memo: '' },
    { tag: 'カフェラテ', location: '柏の葉', name: 'B店', rank: 2, memo: '' },
    { tag: 'カフェラテ', location: '柏の葉', name: 'C店', rank: 3, memo: '' },
  ] as const

  for (const item of seed) {
    await postItem(request, item)
  }

  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('New 1st')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)

  // immediately after rebalance in UI
  await expect(rankedItemSummary(searchSection, 1, 'New 1st')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 2, 'A店')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 3, 'B店')).toBeVisible()
  await expect(searchSection.getByText('C店')).toHaveCount(0)

  await reloadPageAndWaitForSearchReady(page)

  // after reload, ranking must remain
  await expect(rankedItemSummary(searchSection, 1, 'New 1st')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 2, 'A店')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 3, 'B店')).toBeVisible()
  await expect(searchSection.getByText('C店')).toHaveCount(0)

  // API contract: only top3 of same tag with exact ranks
  const apiData = await fetchItems<{
    items: { tag: string; name: string; rank: number }[]
  }>(request)
  const cafe = apiData.items
    .filter((item) => item.tag === 'カフェラテ')
    .sort((a, b) => a.rank - b.rank)

  expect(cafe).toHaveLength(3)
  expect(cafe.map((item) => ({ rank: item.rank, name: item.name }))).toEqual([
    { rank: 1, name: 'New 1st' },
    { rank: 2, name: 'A店' },
    { rank: 3, name: 'B店' },
  ])
})
