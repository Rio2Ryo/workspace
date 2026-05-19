import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sync-break notice is shown once and not repeatedly overwritten by further typing', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Notice Dedup')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()

  const tagInput = registrationTagField(page)
  await tagInput.fill('手')
  await expectOperationStatus(page, '手入力によりタグ連動を解除しました。')

  // further typing should not spam/replace status with the same notice repeatedly
  await tagInput.fill('手入力タグ')
  await expectOperationStatus(page, '手入力によりタグ連動を解除しました。')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
})
