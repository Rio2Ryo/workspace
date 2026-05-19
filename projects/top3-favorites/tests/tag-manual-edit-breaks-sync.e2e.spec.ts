import { expect, test } from '@playwright/test'
import { tagFilterButton, searchClearButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('manual tag edit breaks search-link sync and hides sync status', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Base')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')

  // Manual tag typing should break sync state
  await page.getByLabel('タグ', { exact: true }).fill('手入力タグ')

  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
  await expect(searchClearButton(searchSection)).toHaveCount(0)
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('手入力タグ')
})
