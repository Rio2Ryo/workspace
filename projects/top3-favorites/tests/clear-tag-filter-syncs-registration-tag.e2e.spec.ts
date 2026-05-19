import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
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

test('clearing search tag also clears registration tag to avoid stale input context', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync Test')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  // selecting a tag in search section
  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await clearSearchTagFilter(searchSection)

  // registration tag should also be cleared to avoid stale context mismatch
  await expect(registrationTagField(page)).toHaveValue('')
})
