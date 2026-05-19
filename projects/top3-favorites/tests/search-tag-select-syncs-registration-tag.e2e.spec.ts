import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('selecting a tag in search also syncs registration tag input', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync A')
  await registrationSaveButton(page).click()
  await expect(page.getByText('カフェラテ の1位に保存しました。')).toBeVisible()

  await page.getByLabel('タグ', { exact: true }).fill('つけ麺')
  await page.getByLabel('場所', { exact: true }).fill('松戸')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync B')
  await expect(page.getByLabel('店舗名', { exact: true })).toHaveValue('Sync B')
  await registrationSaveButton(page).click()
  await expect(page.getByText('つけ麺 の1位に保存しました。')).toBeVisible()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await tagFilterButton(searchSection, 'つけ麺').click()

  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('つけ麺')
})
