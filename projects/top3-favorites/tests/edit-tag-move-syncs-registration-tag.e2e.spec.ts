import { expect, test } from '@playwright/test'
import { tagFilterButton, itemEditButton, editSaveButton, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing item tag move keeps registration tag in sync with active search tag state', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('元タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Move Me')
  await registrationSaveButton(page).click()
  await expect(page.getByRole('status')).toContainText('元タグ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await tagFilterButton(searchSection, '元タグ').click()
  await searchSection.getByText(/\d位: Move Me/).click()
  await itemEditButton(searchSection, 'Move Me').click()

  await page.getByRole('combobox', { name: '編集 タグ' }).fill('移動先タグ')
  await editSaveButton(page).click()
  await expect(page.getByRole('status')).toContainText('編集を保存しました。')

  // Search filter is auto-cleared by current behavior; registration tag should also reflect active state
  await expect(searchSection.getByRole('button', { name: 'クリア' })).not.toBeVisible()
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
