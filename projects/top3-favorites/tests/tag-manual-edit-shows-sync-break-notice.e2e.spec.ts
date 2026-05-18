import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('manual tag edit shows notice when search-tag sync is broken', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Notice')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(1)

  await page.getByLabel('タグ', { exact: true }).fill('手入力タグ')
  await expect(page.getByRole('status')).toContainText('手入力によりタグ連動を解除しました。')
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
})
