import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('editing item tag move keeps registration tag in sync with active search tag state', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('元タグ')
  await page.getByLabel('場所', { exact: true }).fill('柏')
  await page.getByLabel('店舗名', { exact: true }).fill('Move Me')
  await page.getByRole('button', { name: 'DBに保存' }).click()
  await expect(page.getByRole('status')).toContainText('元タグ の1位に保存しました。')

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#元タグ' }).click()
  await searchSection.getByText(/\d位: Move Me/).click()
  await searchSection.getByRole('button', { name: 'Move Meを編集' }).click()

  await page.getByRole('combobox', { name: '編集 タグ' }).fill('移動先タグ')
  await page.getByRole('button', { name: '編集を保存' }).click()
  await expect(page.getByRole('status')).toContainText('編集を保存しました。')

  // Search filter is auto-cleared by current behavior; registration tag should also reflect active state
  await expect(searchSection.getByRole('button', { name: 'クリア' })).not.toBeVisible()
  await expect(page.getByLabel('タグ', { exact: true })).toHaveValue('')
})
