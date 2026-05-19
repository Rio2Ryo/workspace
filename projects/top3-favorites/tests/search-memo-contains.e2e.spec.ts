import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
  expectOperationStatus,
  rankedItemSummary,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  resetItemsByReplace,
  searchInput,
  searchSection as searchSectionLocator,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('search query matches memo text (manual QA contract)', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェ')
  await registrationLocationField(page).fill('渋谷')
  await registrationNameField(page).fill('茶亭')
  await registrationMemoField(page).fill('深夜営業あり')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'カフェ の1位に保存しました。')

  await registrationTagField(page).fill('ラーメン')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('とみ田')
  await registrationMemoField(page).fill('濃厚つけ麺')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'ラーメン の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await clearSearchTagFilter(searchSection)
  await searchInput(page).fill('深夜営業')

  await expect(rankedItemSummary(searchSection, 1, '茶亭')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'とみ田')).not.toBeVisible()
})
