import { expect, test } from '@playwright/test'
import { tagFilterButton, clearSearchTagFilter, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clearing search tag also clears registration tag to avoid stale input context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Test')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  // selecting a tag in search section
  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await clearSearchTagFilter(searchSection)

  // registration tag should also be cleared to avoid stale context mismatch
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
