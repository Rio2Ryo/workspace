import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  deleteItemAndWaitForStatus,
  editNameField,
  fetchItems,
  itemEditButton,
  rankedItemSummary,
  rankedItemSummaryByName,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  saveEditAndWaitForStatus,
  saveRegistrationAndWaitForStatus,
  searchSection as searchSectionLocator,
  tagHeading,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('CRUD flow persists across reload and matches API state', async ({ page, request }) => {
  await page.goto('/')

  // Create
  await registrationTagField(page).fill('CRUDタグ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('CRUD Item')
  await registrationMemoField(page).fill('crud create memo')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'CRUDタグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await expect(tagHeading(searchSection, 'CRUDタグ')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'CRUD Item')).toBeVisible()

  // Update
  await rankedItemSummary(searchSection, 1, 'CRUD Item').click()
  await itemEditButton(searchSection as searchSectionLocator, 'CRUD Item').click()
  await editNameField(page).fill('CRUD Item Edited')
  await saveEditAndWaitForStatus(page, '編集を保存しました。')
  await expect(rankedItemSummaryByName(searchSection, 'CRUD Item Edited')).toBeVisible()

  // Delete
  await rankedItemSummary(searchSection, 1, 'CRUD Item Edited').click()
  await deleteItemAndWaitForStatus(
    page,
    searchSection as searchSectionLocator,
    'CRUD Item Edited',
    'CRUD Item Edited',
    '削除しました。',
  )
  await expect(searchSection.getByText('CRUD Item Edited')).toHaveCount(0)

  // Reload persistence
  await reloadPageAndWaitForSearchReady(page)
  await expect(searchSection.getByText('CRUD Item Edited')).toHaveCount(0)

  // API consistency
  const apiData = await fetchItems<{ items: { name: string; tag: string; location: string; memo: string; rank: number }[] }>(request)
  expect(canonicalizeItemsById(apiData.items.map((item) => ({ name: item.name })))).toBe(
    canonicalizeItemsById([]),
  )

})
