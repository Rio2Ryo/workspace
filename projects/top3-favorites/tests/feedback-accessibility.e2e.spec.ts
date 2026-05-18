import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  await request.post('/api/items?mode=replace', { data: { items: [] } })
})

test('success and error feedback are exposed through accessible live regions', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'invalid-shape.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"foo":1}', 'utf-8'),
  })

  await expect(page.getByRole('alert')).toContainText('インポート失敗: JSON配列形式ではありません。既存データは保持しました。')
  await expect(page.getByRole('status')).not.toBeVisible()
})
