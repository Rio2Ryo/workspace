import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview blocks edit until user cancels the import context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Edit Target')
  await page.getByRole('button', { name: 'DBに保存' }).click()

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

  await page.getByText('1位: Edit Target').click()
  await expect(page.getByRole('button', { name: 'Edit Targetを編集' })).toBeDisabled()

  await page.getByRole('button', { name: 'インポートをキャンセル' }).click()
  await page.getByRole('button', { name: 'Edit Targetを編集' }).click()
  await expect(page.getByRole('button', { name: '編集を保存' })).toBeVisible()
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)
})
