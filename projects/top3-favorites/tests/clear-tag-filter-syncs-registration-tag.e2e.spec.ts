import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
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

test('clearing search tag also clears registration tag to avoid stale input context', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync Test')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  // selecting a tag in search section
  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await clearSearchTagFilter(searchSection)

  // registration tag should also be cleared to avoid stale context mismatch
  await expect(registrationTagField(page)).toHaveValue('')
})
