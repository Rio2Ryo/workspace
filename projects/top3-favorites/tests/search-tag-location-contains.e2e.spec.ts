import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
  rankedItemSummary,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
  searchInput,
  searchSection as searchSectionLocator,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('search query matches tag and location by partial text (manual QA contract)', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉キャンパス')
  await registrationNameField(page).fill('Cafe Alpha')
  await registrationMemoField(page).fill('タグ・場所検索検証')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  await registrationTagField(page).fill('ラーメン')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('Ramen Beta')
  await registrationMemoField(page).fill('比較対象')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'ラーメン の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await clearSearchTagFilter(searchSection)

  // tag partial match
  await searchInput(page).fill('カフェ')
  await expect(rankedItemSummary(searchSection, 1, 'Cafe Alpha')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'Ramen Beta')).not.toBeVisible()

  // location partial match
  await searchInput(page).fill('柏の葉')
  await expect(rankedItemSummary(searchSection, 1, 'Cafe Alpha')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'Ramen Beta')).not.toBeVisible()
})
