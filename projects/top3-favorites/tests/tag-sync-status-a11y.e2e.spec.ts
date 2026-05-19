import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag sync status is visible while operation notice remains the single live status channel', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('A11y Sync')
  await registrationSaveButton(page).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await tagFilterButton(searchSection, 'カフェラテ').click()

  const sync = page.getByTestId('tag-sync-status')
  await expect(sync).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')
  await expect(sync).not.toHaveAttribute('aria-live')
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')
})
