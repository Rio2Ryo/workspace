import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('manual tag edit shows notice when search-tag sync is broken', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync Notice')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  await registrationTagField(page).fill('手入力タグ')
  await expectOperationStatus(page, '手入力によりタグ連動を解除しました。')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
})
