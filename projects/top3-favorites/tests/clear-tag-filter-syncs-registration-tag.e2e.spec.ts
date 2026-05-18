import { expect, test } from '@playwright/test'
import { clearSearchTagFilter, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clearing search tag also clears registration tag to avoid stale input context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Sync Test')
  await registrationSaveButton(page).click()
  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  // selecting a tag in search section
  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await clearSearchTagFilter(searchSection)

  // registration tag should also be cleared to avoid stale context mismatch
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
