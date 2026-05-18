import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview stays visible while choosing another JSON and then replaces after file selection', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const firstPayload = [
    { id: 'p1', tag: 'プリン', location: '浅草', name: 'Preview A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  const secondPayload = [
    { id: 'p2', tag: 'プリン', location: '浅草', name: 'Preview B', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'preview-a.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(firstPayload), 'utf-8'),
  })

  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-preview-replace-hint')).toContainText('別ファイルを選ぶと現在のプレビューを置き換えます')
  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-a.json')

  await page.getByRole('button', { name: 'JSONインポート' }).click()
  await expect(page.getByLabel('インポート確認')).toBeVisible()
  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-a.json')

  await fileInput.setInputFiles({
    name: 'preview-b.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(secondPayload), 'utf-8'),
  })

  await expect(page.getByTestId('import-preview-summary')).toContainText('preview-b.json')
  await expect(page.getByTestId('import-preview-summary')).not.toContainText('preview-a.json')
})
