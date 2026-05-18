import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('re-opening JSON import clears stale pending preview to avoid accidental old import', async ({ page }) => {
  await page.goto('/')

  const now = new Date().toISOString()
  const payload = [
    { id: 'p1', tag: 'プリン', location: '浅草', name: 'Preview A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'preview.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf-8'),
  })

  await expect(page.getByLabel('インポート確認')).toBeVisible()

  // user decides to retry import selection; stale pending preview should be cleared first
  await page.getByRole('button', { name: 'JSONインポート' }).click()
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)
})
