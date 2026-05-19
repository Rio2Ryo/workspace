import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('typing same tag with trailing whitespace does not falsely break sync', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Whitespace Sync')
  await registrationSaveButton(page).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await tagFilterButton(searchSection, 'カフェラテ').click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ ')

  // still considered same tag context, so sync remains and no break notice
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)
  await expect(page.getByRole('status')).not.toContainText('手入力によりタグ連動を解除しました。')
})
