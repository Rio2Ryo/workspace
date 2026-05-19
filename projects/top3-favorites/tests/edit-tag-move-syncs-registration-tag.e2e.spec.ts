import { expect, test } from '@playwright/test'
import {
  editSaveButton,
  editTagField,
  expectOperationStatus,
  itemEditButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  searchClearButton,
  searchSection as searchSectionLocator,
  tagFilterButton,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing item tag move keeps registration tag in sync with active search tag state', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('元タグ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Move Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '元タグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, '元タグ').click()
  await rankedItemSummary(searchSection, 1, 'Move Me').click()
  await itemEditButton(searchSection as searchSectionLocator, 'Move Me').click()

  await editTagField(page).fill('移動先タグ')
  await editSaveButton(page).click()
  await expectOperationStatus(page, '編集を保存しました。')

  // Search filter is auto-cleared by current behavior; registration tag should also reflect active state
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(registrationTagField(page)).toHaveValue('')
})
