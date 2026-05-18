import { expect, test } from '@playwright/test'
import { resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clicking JSON import to retry clears stale import error before next file selection', async ({ page }) => {
  await page.goto('/')

  const fileInput = page.locator('input[type="file"][accept*="json"]')
  await fileInput.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"broken": ', 'utf-8'),
  })

  await expect(page.getByRole('alert')).toContainText('インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')

  // Start retry flow: stale error should be cleared when user re-opens importer
  await page.getByRole('button', { name: 'JSONインポート' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
