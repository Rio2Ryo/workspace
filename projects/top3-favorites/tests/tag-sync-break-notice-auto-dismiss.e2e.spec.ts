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

test('sync-break notice auto-dismisses after short duration', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Auto Dismiss')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()

  await registrationTagField(page).fill('手入力タグ')
  await expectOperationStatus(page, '手入力によりタグ連動を解除しました。')

  await expect(page.getByText('手入力によりタグ連動を解除しました。')).toHaveCount(0, { timeout: 5000 })
  await expect(tagSyncStatus(page)).toHaveCount(0)
})
