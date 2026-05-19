import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag sync should not break for semantically same tag with half/full width spaces', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェ ラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Space Normalize')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェ ラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェ ラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  // Same meaning with full-width space should keep sync
  await page.getByLabel('タグ', { exact: true }).fill('カフェ　ラテ')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)
})
