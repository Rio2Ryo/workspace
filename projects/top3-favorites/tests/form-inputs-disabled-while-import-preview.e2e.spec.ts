import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('registration form inputs are locked while import preview is active', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'pending.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-lock-hint')).toBeVisible()

  await expect(page.getByLabel('タグ', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('場所', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('店舗名', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('登録 1位に入れる')).toBeDisabled()
  await expect(page.getByLabel('登録 2位に入れる')).toBeDisabled()
  await expect(page.getByLabel('登録 3位に入れる')).toBeDisabled()
  await expect(page.getByLabel('メモ', { exact: true })).toBeDisabled()
})
