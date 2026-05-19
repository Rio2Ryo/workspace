import { expect, test } from '@playwright/test'
import {
  tagFilterButton,
  searchClearButton,
  acceptNextDeleteDialog,
  resetItemsByReplace,
  itemDeleteButton,
  registrationSaveButton,
  expectOperationStatus,
  searchSection as searchSectionLocator,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  tagHeading,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('deleting the last item in selected tag clears stale tag filter and keeps remaining tags visible', async ({ page }) => {
  await page.goto('/')

  // Seed two tags via real UI
  await registrationTagField(page).fill('削除対象タグ')
  await registrationLocationField(page).fill('柏')
  await registrationNameField(page).fill('Delete Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '削除対象タグ の1位に保存しました。')

  await registrationTagField(page).fill('残すタグ')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('Keep Me')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, '残すタグ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)

  // Select the tag we are about to empty
  await tagFilterButton(searchSection as searchSectionLocator, '削除対象タグ').click()
  await expect(searchSection.getByText(/\d位: Delete Me/)).toBeVisible()

  // Delete the only item in that selected tag
  await searchSection.getByText(/\d位: Delete Me/).click()
  const dialogPromise = acceptNextDeleteDialog(page, 'Delete Me')
  await itemDeleteButton(searchSection as searchSectionLocator, 'Delete Me').click()
  await dialogPromise

  await expectOperationStatus(page, '削除しました。')

  // Stale selectedTag should be cleared so remaining data is visible
  await expect(searchClearButton(searchSection)).not.toBeVisible()
  await expect(tagHeading(searchSection, '残すタグ')).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()

  await reloadPageAndWaitForSearchReady(page)
  await expect(tagHeading(searchSection, '残すタグ')).toBeVisible()
  await expect(searchSection.getByText(/\d位: Keep Me/)).toBeVisible()
  await expect(searchSection.getByText('Delete Me')).not.toBeVisible()
})
