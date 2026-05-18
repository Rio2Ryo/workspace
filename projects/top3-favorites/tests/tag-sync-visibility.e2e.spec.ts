import { expect, test } from '@playwright/test'
import { clearSearchTagFilter, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('shows sync status when tag is selected and hides after clear', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Marker')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()

  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')

  await clearSearchTagFilter(searchSection)
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
