import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton, registrationRankButton, expectOperationStatus, clearSearchTagFilter, searchSection as searchSectionLocator, searchInput } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('search query matches memo text (manual QA contract)', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェ')
  await page.getByLabel('場所', { exact: true }).fill('渋谷')
  await page.getByLabel('店舗名', { exact: true }).fill('茶亭')
  await page.getByLabel('メモ', { exact: true }).fill('深夜営業あり')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェ の1位に保存しました。')

  await page.getByLabel('タグ', { exact: true }).fill('ラーメン')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('とみ田')
  await page.getByLabel('メモ', { exact: true }).fill('濃厚つけ麺')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'ラーメン の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await clearSearchTagFilter(searchSection)
  await searchInput(page).fill('深夜営業')

  await expect(searchSection.getByText(/1位: 茶亭/)).toBeVisible()
  await expect(searchSection.getByText(/1位: とみ田/)).not.toBeVisible()
})
