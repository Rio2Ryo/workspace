import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
  tagSyncStatus,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag sync should not break for semantically same tag with half/full width spaces', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェ ラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Space Normalize')
  await saveRegistrationAndWaitForStatus(page, 'カフェ ラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェ ラテ').click()
  await expect(tagSyncStatus(page)).toHaveCount(1)

  // Same meaning with full-width space should keep sync
  await registrationTagField(page).fill('カフェ　ラテ')
  await expect(tagSyncStatus(page)).toHaveCount(1)
})
