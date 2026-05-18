import { expect, test } from '@playwright/test'
import { resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag filter clear action is exposed as クリア and resets list to all items', async ({ page }) => {
  await page.goto('/')

  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).first().click()

  await expect(searchSection.getByRole('button', { name: 'クリア' })).toBeVisible()
  await searchSection.getByRole('button', { name: 'クリア' }).click()

  await expect(searchSection.getByText(/1位: Solito MAGO/)).toBeVisible()
  await expect(searchSection.getByText(/1位: とみ田/)).toBeVisible()
})
