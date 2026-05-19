import { expect, test } from '@playwright/test'
import { tagFilterButton, searchClearButton, itemEditButton, editSaveButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing item tag move keeps registration tag in sync with active search tag state', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('元タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Move Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '元タグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, '元タグ').click()
  await searchSection.getByText(/\d位: Move Me/).click()
  await itemEditButton(searchSection as searchSectionLocator, 'Move Me').click()

  await page.getByRole('combobox', { name: '編集 タグ' }).fill('移動先タグ')
  await editSaveButton(page).click()
  await expectOperationStatus(page, '編集を保存しました。')

  // Search filter is auto-cleared by current behavior; registration tag should also reflect active state
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
