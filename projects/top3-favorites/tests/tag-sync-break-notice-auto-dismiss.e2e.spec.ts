import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sync-break notice auto-dismisses after short duration', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Auto Dismiss')
  await registrationSaveButton(page).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()

  await page.getByLabel('タグ', { exact: true }).fill('手入力タグ')
  await expect(page.getByRole('status')).toContainText('手入力によりタグ連動を解除しました。')

  await expect(page.getByText('手入力によりタグ連動を解除しました。')).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
})
