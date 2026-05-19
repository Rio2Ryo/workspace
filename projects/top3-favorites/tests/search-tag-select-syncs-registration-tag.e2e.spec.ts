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

test('selecting a tag in search also syncs registration tag input', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync A')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  await registrationTagField(page).fill('つけ麺')
  await registrationLocationField(page).fill('松戸')
  await registrationNameField(page).fill('Sync B')
  await expect(registrationNameField(page)).toHaveValue('Sync B')
  await saveRegistrationAndWaitForStatus(page, 'つけ麺 の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'つけ麺').click()

  await expect(registrationTagField(page)).toHaveValue('つけ麺')
})
