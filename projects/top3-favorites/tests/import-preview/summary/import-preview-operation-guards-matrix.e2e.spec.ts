import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview enforces operation guards across registration/search actions', async ({ page }) => {
  await page.goto('/')

  // seed one item so edit/delete actions are rendered
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Guard Seed')
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
  await expect(page.getByTestId('import-lock-hint')).toBeVisible()

  // registration form locks
  await expect(page.getByLabel('タグ', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('場所', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('店舗名', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('メモ', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '登録 1位に入れる' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '登録 2位に入れる' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '登録 3位に入れる' })).toBeDisabled()

  // save/sample locks
  await expect(page.getByRole('button', { name: 'DBに保存' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'サンプルをDB保存' })).toBeDisabled()

  // list actions lock
  await page.getByText('1位: Guard Seed').click()
  await expect(page.getByRole('button', { name: 'Guard Seedを編集' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Guard Seedを削除' })).toBeDisabled()

  // import controls remain available to finish/cancel
  await expect(page.getByRole('button', { name: 'この内容でインポート' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'インポートをキャンセル' })).toBeEnabled()
})
