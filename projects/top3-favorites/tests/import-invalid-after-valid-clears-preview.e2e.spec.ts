import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('invalid JSON after a valid import preview clears pending preview and keeps existing data', async ({ page, request }) => {
  await page.goto('/')

  // seed one existing item
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Base Item')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const now = new Date().toISOString()
  const validItems = [
    { id: 'v1', tag: 'プリン', location: '浅草', name: 'P1', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
    { id: 'v2', tag: 'プリン', location: '浅草', name: 'P2', rank: 2, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  // 1) valid file -> preview visible
  await uploadJsonImportFile(page, 'valid.json', validItems)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  // 2) invalid file -> preview must be cleared (fail-closed UI)
  await uploadJsonImportFile(page, 'broken.json', '{"broken": ')

  await expect(page.getByRole('alert')).toContainText('インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)

  // DB should remain unchanged (still seeded 1 item)
  const apiData = (await request.get('/api/items').then((res) => res.json())) as { items: { name: string }[] }
  expect(apiData.items).toHaveLength(1)
  expect(apiData.items[0]?.name).toBe('Base Item')
})
