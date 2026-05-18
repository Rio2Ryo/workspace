import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('json import/export UI exists and invalid import keeps existing data', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'サンプルをDB保存' })).toBeVisible()
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  // Export / Import buttons should exist
  await expect(page.getByRole('button', { name: 'JSONエクスポート' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'JSONインポート' })).toBeVisible()

  // Invalid import must not destroy existing data (fail-closed)
  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"foo":1}', 'utf-8'),
  })

  await expect(page.getByText(/インポート失敗/)).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})

test('valid import clears stale tag filters so imported data is immediately visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(searchSection.getByText('1位: Solito MAGO')).toBeVisible()

  const importedItems = [
    {
      id: 'imported-1',
      tag: 'スイーツ',
      location: '浅草',
      name: 'Imported Pudding',
      rank: 1,
      memo: 'フィルタ解除の回帰テスト',
      mapsUrl: 'https://example.test/maps',
      placeId: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'valid-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedItems), 'utf-8'),
  })

  await expect(page.getByText('現在3件 → インポート後1件')).toBeVisible()
  await page.getByRole('button', { name: 'この内容でインポート' }).click()
  await expect(page.getByText('インポート成功: 1件を反映しました。')).toBeVisible()
  await expect(searchSection.getByRole('heading', { name: 'スイーツ' })).toBeVisible()
  await expect(searchSection.getByText('1位: Imported Pudding')).toBeVisible()
  await expect(searchSection.getByRole('button', { name: 'クリア' })).not.toBeVisible()
})
