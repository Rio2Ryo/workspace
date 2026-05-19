import { expect, test } from '@playwright/test'
import { tagFilterButton, searchClearButton, itemEditButton, editSaveButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing last item tag clears stale selected filter so remaining data is visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags
  await page.getByLabel('タグ', { exact: true }).fill('元タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Move Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '元タグ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('残るタグ')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Keep Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '残るタグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)

  // Filter by 元タグ and edit its only item to another tag
  await tagFilterButton(searchSection as searchSectionLocator, '元タグ').click()
  await expect(searchSection.getByText(/\d位: Move Me/)).toBeVisible()
  await searchSection.getByText(/\d位: Move Me/).click()
  await itemEditButton(searchSection as searchSectionLocator, 'Move Me').click()

  await page.getByRole('combobox', { name: '編集 タグ' }).fill('移動先タグ')
  await editSaveButton(page).click()
  await expectOperationStatus(page, '編集を保存しました。')

  // stale filter should be cleared because 元タグ no longer exists
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '残るタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '移動先タグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Move Me/)).toBeVisible()
})
