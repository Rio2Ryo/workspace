import { expect, test } from '@playwright/test'
import {
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
  searchInput,
  searchSection as searchSectionLocator,
  tagFilterButton,
  rankedItemSummaryByName,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('search combines selected tag chip and text query with AND semantics', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Cafe Alpha')
  await registrationMemoField(page).fill('morning')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'カフェ の1位に保存しました。')

  await registrationTagField(page).fill('カフェ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Cafe Beta')
  await registrationMemoField(page).fill('night')
  await registrationRankButton(page, 2).click()
  await saveRegistrationAndWaitForStatus(page, 'カフェ の2位に保存しました。')

  await registrationTagField(page).fill('ラーメン')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Ramen Gamma')
  await registrationMemoField(page).fill('night')
  await registrationRankButton(page, 1).click()
  await saveRegistrationAndWaitForStatus(page, 'ラーメン の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェ').click()
  await searchInput(page).fill('night')

  await expect(rankedItemSummaryByName(searchSection, 'Cafe Beta')).toBeVisible()
  await expect(rankedItemSummaryByName(searchSection, 'Cafe Alpha')).toHaveCount(0)
  await expect(rankedItemSummaryByName(searchSection, 'Ramen Gamma')).toHaveCount(0)
})
