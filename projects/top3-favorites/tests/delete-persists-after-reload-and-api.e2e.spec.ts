import { expect, test } from '@playwright/test'
import {
  tagFilterButton,
  acceptNextDeleteDialog,
  resetItemsByReplace,
  itemDeleteButton,
  expectOperationStatus,
  searchSection as searchSectionLocator,
  reloadPageAndWaitForSearchReady,
  fetchItems,
  postItem,
  rankedItemSummary,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('deleted item stays removed after reload and is absent from API data', async ({ page, request }) => {
  // Seed through the API so this test isolates the delete/reload persistence contract
  // from create-form async state transitions already covered by create persistence specs.
  for (const item of [
    { tag: '削除タグ', location: '柏', name: 'Delete Persist Target', rank: 1, memo: '' },
    { tag: '残存タグ', location: '松戸', name: 'Persist Survivor', rank: 1, memo: '' },
  ]) {
    const response = await postItem(request, item)
    expect(response.status()).toBe(200)
  }

  await page.goto('/')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, '削除タグ').click()
  await rankedItemSummary(searchSection, 1, 'Delete Persist Target').click()

  const dialogPromise = acceptNextDeleteDialog(page, 'Delete Persist Target')
  await itemDeleteButton(searchSection as searchSectionLocator, 'Delete Persist Target').click()
  await dialogPromise
  await expectOperationStatus(page, '削除しました。')

  // UI state before reload
  await expect(searchSection.getByText('Delete Persist Target')).toHaveCount(0)
  await tagFilterButton(searchSection as searchSectionLocator, '残存タグ').click()
  await expect(searchSection.getByText(/1位:\s*Persist Survivor/)).toBeVisible()

  await reloadPageAndWaitForSearchReady(page)

  // UI state after reload
  await expect(searchSection.getByText('Delete Persist Target')).toHaveCount(0)
  await expect(searchSection.getByText(/1位:\s*Persist Survivor/)).toBeVisible()

  // API persistence contract
  const apiData = await fetchItems<{
    items: { name: string; tag: string }[]
  }>(request)
  expect(apiData.items.some((item) => item.name === 'Delete Persist Target')).toBe(false)
  expect(apiData.items.some((item) => item.name === 'Persist Survivor')).toBe(true)
})
