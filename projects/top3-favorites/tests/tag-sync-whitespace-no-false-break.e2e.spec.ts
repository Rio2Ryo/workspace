import { expect, test } from '@playwright/test'
import {
  expectOperationStatus,
  operationStatus,
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

test('typing same tag with trailing whitespace does not falsely break sync', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Whitespace Sync')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  await registrationTagField(page).fill('カフェラテ ')

  // still considered same tag context, so sync remains and no break notice
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)
  await expect(operationStatus(page)).not.toContainText('手入力によりタグ連動を解除しました。')
})
