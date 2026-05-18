import { expect, test } from '@playwright/test'
import { resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('maps link opens in a new tab with safe rel attributes', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Solito MAGO')
  await page.getByLabel('メモ', { exact: true }).fill('maps attr contract')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await registrationSaveButton(page).click()

  await expect(page.getByRole('status')).toContainText('カフェラテ の1位に保存しました。')

  const group = page.locator('.group').filter({ has: page.getByRole('heading', { name: 'カフェラテ' }) })
  await group.locator('summary', { hasText: /1位:\s*Solito MAGO/ }).click()

  const mapsLink = group.getByRole('link', { name: 'Mapsで開く' }).first()
  await expect(mapsLink).toBeVisible()
  await expect(mapsLink).toHaveAttribute('target', '_blank')

  const rel = await mapsLink.getAttribute('rel')
  expect(rel).toBeTruthy()
  const relTokens = new Set((rel ?? '').split(/\s+/).filter(Boolean))
  expect(relTokens.has('noreferrer')).toBe(true)
})
