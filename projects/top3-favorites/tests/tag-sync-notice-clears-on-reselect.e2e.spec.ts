import { expect, test } from '@playwright/test'
import { tagFilterButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('sync-break notice clears when user reselects a tag and sync resumes', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Reselect Notice')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await tagFilterButton(searchSection, 'カフェラテ').click()

  await page.getByLabel('タグ', { exact: true }).fill('手入力タグ')
  await expectOperationStatus(page, '手入力によりタグ連動を解除しました。')

  await tagFilterButton(searchSection, 'カフェラテ').click()

  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')
  await expect(page.getByText('手入力によりタグ連動を解除しました。')).toHaveCount(0)
})
