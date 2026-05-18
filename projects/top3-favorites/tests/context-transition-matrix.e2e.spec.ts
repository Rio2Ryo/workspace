import { expect, test } from '@playwright/test'
import { clearSearchTagFilter, uploadJsonImportFile, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('context transition matrix keeps only one active workflow context', async ({ page }) => {
  await page.goto('/')

  // seed search/edit target
  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Context Base')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const searchSection = page.locator('section.card').filter({ has: page.getByRole('heading', { name: '探す' }) })

  // baseline: import preview visible
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  // search select should close import preview
  await searchSection.getByRole('button', { name: '#カフェラテ' }).click()
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)

  // make import preview visible again
  await uploadJsonImportFile(page, 'pending-again.json', payload)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  // search clear should also close import preview
  await clearSearchTagFilter(searchSection)
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)

  // open edit context
  await page.getByText('1位: Context Base').click()
  await page.getByRole('button', { name: /編集/ }).first().click()
  await expect(page.getByRole('button', { name: '編集を保存' })).toBeVisible()

  // starting import should close edit context
  await page.getByRole('button', { name: 'JSONインポート' }).click()
  await expect(page.getByRole('button', { name: '編集を保存' })).toHaveCount(0)
})
