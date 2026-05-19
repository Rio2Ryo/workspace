import { expect, test } from '@playwright/test'
import {
  saveEditAndWaitForStatus,
  editTagField,
  expectOperationStatus,
  itemEditButton,
  rankedItemSummary,
  rankedItemSummaryByName,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  searchClearButton,
  searchSection as searchSectionLocator,
  tagFilterButton,
  tagHeading,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing last item tag clears stale selected filter so remaining data is visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags
  await registrationTagField(page).fill('元タグ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Move Me')
  await saveRegistrationAndWaitForStatus(page, '元タグ の1位に保存しました。')

  await registrationTagField(page).fill('残るタグ')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('Keep Me')
  await saveRegistrationAndWaitForStatus(page, '残るタグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)

  // Filter by 元タグ and edit its only item to another tag
  await tagFilterButton(searchSection as searchSectionLocator, '元タグ').click()
  await expect(rankedItemSummaryByName(searchSection, 'Move Me')).toBeVisible()
  await rankedItemSummary(searchSection, 1, 'Move Me').click()
  await itemEditButton(searchSection as searchSectionLocator, 'Move Me').click()

  await editTagField(page).fill('移動先タグ')
  await saveEditAndWaitForStatus(page, '編集を保存しました。')

  // stale filter should be cleared because 元タグ no longer exists
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(tagHeading(searchSection, '残るタグ')).toBeVisible()
  await expect(rankedItemSummaryByName(searchSection, 'Keep Me')).toBeVisible()
  await expect(tagHeading(searchSection, '移動先タグ')).toBeVisible()
  await expect(rankedItemSummaryByName(searchSection, 'Move Me')).toBeVisible()
})
