import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import rejects rank out of range and keeps existing data (fail-closed)', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()

  const invalidItems = [
    {
      id: 'x-1',
      tag: 'カフェラテ',
      location: '柏の葉',
      name: 'Bad Rank Cafe',
      rank: 4,
      memo: 'invalid rank',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
      placeId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
  await uploadJsonImportFile(page, 'invalid-rank.json', invalidItems)

  await expect(page.getByText(/インポート失敗/)).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('Bad Rank Cafe')).not.toBeVisible()
})

test('import rejects duplicate ids with a clear message and keeps existing data', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()

  const duplicateItems = [
    {
      id: 'dup-ui-1',
      tag: 'プリン',
      location: '浅草',
      name: 'Duplicate Pudding A',
      rank: 1,
      memo: 'duplicate id A',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
      placeId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'dup-ui-1',
      tag: 'プリン',
      location: '浅草',
      name: 'Duplicate Pudding B',
      rank: 2,
      memo: 'duplicate id B',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=test',
      placeId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  await uploadJsonImportFile(page, 'duplicate-ids.json', duplicateItems)

  await expect(page.getByRole('alert')).toContainText(
    'インポート失敗: ファイル「duplicate-ids.json」のID「dup-ui-1」が1件目「Duplicate Pudding A」と2件目「Duplicate Pudding B」で重複しています。既存データは保持しました。',
  )
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText(/1位: Duplicate Pudding A/)).not.toBeVisible()
  await expect(page.getByText(/2位: Duplicate Pudding B/)).not.toBeVisible()
})
