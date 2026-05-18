import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import rejects rank out of range and keeps existing data (fail-closed)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
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

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'invalid-rank.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalidItems), 'utf-8'),
  })

  await expect(page.getByText(/インポート失敗/)).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('Bad Rank Cafe')).not.toBeVisible()
})

test('import rejects duplicate ids with a clear message and keeps existing data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
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

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'duplicate-ids.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(duplicateItems), 'utf-8'),
  })

  await expect(page.getByText(/インポート失敗: IDが重複しています/)).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
  await expect(page.getByText('Duplicate Pudding A')).not.toBeVisible()
  await expect(page.getByText('Duplicate Pudding B')).not.toBeVisible()
})
