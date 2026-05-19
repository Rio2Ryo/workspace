import { expect, test } from '@playwright/test'
import { tagFilterButton, searchClearButton, acceptNextDeleteDialog, resetItemsByReplace, itemDeleteButton, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('deleting the last item in selected tag clears stale tag filter and keeps remaining tags visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags via real UI
  await page.getByLabel('タグ', { exact: true }).fill('削除対象タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Delete Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '削除対象タグ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('残すタグ')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Keep Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '残すタグ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })

  // Select the tag we are about to empty
  await tagFilterButton(searchSection, '削除対象タグ').click()
  await expect(searchSection.getByText(/\d位: Delete Me/)).toBeVisible()

  // Delete the only item in that selected tag
  await searchSection.getByText(/\d位: Delete Me/).click()
  const dialogPromise = acceptNextDeleteDialog(page, 'Delete Me')
  await itemDeleteButton(searchSection, 'Delete Me').click()
  await dialogPromise

  await expectOperationStatus(page, '削除しました。')

  // Stale selectedTag should be cleared so remaining data is visible
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(searchSection.getByRole('heading', { name: '残すタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()

  await page.reload()
  await expect(searchSection.getByRole('heading', { name: '残すタグ' })).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()
  await expect(searchSection.getByText('Delete Me')).not.toBeVisible()
})
