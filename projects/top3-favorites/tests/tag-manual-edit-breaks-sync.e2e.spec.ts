import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  resetItemsByReplace,
  searchClearButton,
  searchSection as searchSectionLocator,
  tagFilterButton,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('manual tag edit breaks search-link sync and hides sync status', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync Base')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')

  // Manual tag typing should break sync state
  await registrationTagField(page).fill('手入力タグ')

  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
  await expect(searchClearButton(searchSection)).toHaveCount(0)
  await expect(registrationTagField(page)).toHaveValue('手入力タグ')
})
