import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag sync should not break for semantically same tag with half/full width spaces', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェ ラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Space Normalize')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェ ラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェ ラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  // Same meaning with full-width space should keep sync
  await registrationTagField(page).fill('カフェ　ラテ')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)
})
