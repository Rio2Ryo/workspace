import { expect, test } from '@playwright/test'
import { itemEditButton, editSaveButton, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('editing last item tag clears stale selected filter so remaining data is visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags
  await page.getByLabel('タグ', { exact: true }).fill('元タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Move Me')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('元タグ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('残るタグ')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Keep Me')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('残るタグ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })

  // Filter by 元タグ and edit its only item to another tag
  await searchSection.getByRole('button', { name: '#元タグ' }).click()
  await expect(searchSection.getByText(/\d位: Move Me/)).toBeVisible()
  await searchSection.getByText(/\d位: Move Me/).click()
  await itemEditButton(searchSection, 'Move Me').click()

  await page.getByRole('combobox', { name: '編集 タグ' }).fill('移動先タグ')
  await editSaveButton(page).click()
  await expect(page.getByRole('status')).toContainText('編集を保存しました。')

  // stale filter should be cleared because 元タグ no longer exists
  await expect(searchSection.getByRole('button', { name: 'クリア' })).not.toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '残るタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '移動先タグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Move Me/)).toBeVisible()
})
