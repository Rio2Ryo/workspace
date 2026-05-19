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

test('tag sync status is visible while operation notice remains the single live status channel', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('A11y Sync')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()

  const sync = page.getByTestId('tag-sync-status')
  await expect(sync).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')
  await expect(sync).not.toHaveAttribute('aria-live')
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')
})
